import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { HttpClient } from "../src/http.js";
import { USCCBArgumentError, USCCBParseError } from "../src/errors.js";
import { MassType, SectionType, massToString } from "../src/models.js";
import { USCCB } from "../src/usccb.js";
import { parseIsoDate } from "../src/utils.js";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "data");

function buildUsccbHtml(
  title: string,
  sections: Array<{
    name: string;
    addressHtml: string;
    bodyHtml: string;
  }>
): string {
  const containers = sections
    .map(
      (s) => `
      <div class="container">
        <div class="name">${s.name}</div>
        <div class="address">${s.addressHtml}</div>
        <div class="content-body">${s.bodyHtml}</div>
      </div>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html>
  <head><title>${title} | USCCB</title></head>
  <body>${containers}</body>
</html>`;
}

const noopClient: HttpClient = {
  async get() {
    return { text: "", ok: true, status: 200, url: "" };
  },
  async head(url: string) {
    return { text: "", ok: true, status: 200, url };
  },
};

describe("Liturgical seasons and special celebrations", () => {
  const usccb = new USCCB(noopClient);

  it("parses Lenten weekday with 'Verse Before the Gospel' as ALLELUIA (not GOSPEL)", () => {
    const html = buildUsccbHtml("Wednesday of the First Week of Lent", [
      {
        name: "Reading 1",
        addressHtml: `<a href="https://bible.usccb.org/bible/jonah/3?1">Jon 3:1-10</a>`,
        bodyHtml: `<p>The word of the LORD came to Jonah a second time.</p>`,
      },
      {
        name: "Responsorial Psalm",
        addressHtml: `<a href="https://bible.usccb.org/bible/psalms/51?3">Ps 51:3-4, 12-13, 18-19</a>`,
        bodyHtml: `<p>R. A heart contrite and humbled, O God, you will not spurn.</p>`,
      },
      {
        name: "Verse Before the Gospel",
        addressHtml: `<a href="https://bible.usccb.org/bible/joel/2?12">Jl 2:12-13</a>`,
        bodyHtml: `<p>Even now, says the LORD, return to me with your whole heart.</p>`,
      },
      {
        name: "Gospel",
        addressHtml: `<a href="https://bible.usccb.org/bible/luke/11?29">Lk 11:29-32</a>`,
        bodyHtml: `<p>While still more people gathered in the crowd, Jesus said to them.</p>`,
      },
    ]);

    const mass = usccb.parseMass(
      html,
      "https://bible.usccb.org/bible/readings/031225.cfm",
      parseIsoDate("2025-03-12"),
      MassType.DEFAULT
    );

    expect(mass.sections.map((s) => s.type)).toEqual([
      SectionType.READING,
      SectionType.PSALM,
      SectionType.ALLELUIA,
      SectionType.GOSPEL,
    ]);

    const rendered = massToString(mass);
    const verseIdx = rendered.indexOf("Verse Before the Gospel:");
    const gospelIdx = rendered.indexOf("Gospel: Luke");
    const verseBlock = rendered.slice(verseIdx, gospelIdx);
    expect(verseBlock).not.toContain("The Gospel of the Lord.");
    expect(verseBlock).not.toContain("Praise to you, Lord Jesus Christ.");
    expect(rendered.slice(gospelIdx)).toContain("The Gospel of the Lord.");
  });

  it("parses Lenten Gospel Acclamation headers ('Praise to you, Lord Jesus Christ')", () => {
    const html = buildUsccbHtml("First Sunday of Lent", [
      {
        name: "Reading I",
        addressHtml: `<a href="https://bible.usccb.org/bible/deuteronomy/26?4">Dt 26:4-10</a>`,
        bodyHtml: `<p>Moses spoke to the people.</p>`,
      },
      {
        name: "Praise to you, Lord Jesus Christ, King of endless glory!",
        addressHtml: `<a href="https://bible.usccb.org/bible/matthew/4?4">Mt 4:4b</a>`,
        bodyHtml: `<p>One does not live on bread alone.</p>`,
      },
      {
        name: "Gospel",
        addressHtml: `<a href="https://bible.usccb.org/bible/luke/4?1">Lk 4:1-13</a>`,
        bodyHtml: `<p>Filled with the Holy Spirit, Jesus returned from the Jordan.</p>`,
      },
    ]);

    const mass = usccb.parseMass(
      html,
      "https://bible.usccb.org/bible/readings/030925.cfm",
      parseIsoDate("2025-03-09"),
      MassType.DEFAULT
    );
    expect(mass.sections[1].type).toBe(SectionType.ALLELUIA);
    expect(mass.sections[2].type).toBe(SectionType.GOSPEL);
  });

  it("parses Easter Sunday including Sequence without Bible citation link", () => {
    const html = buildUsccbHtml(
      "Easter Sunday of the Resurrection of the Lord",
      [
        {
          name: "Reading 1",
          addressHtml: `<a href="https://bible.usccb.org/bible/acts/10?34">Acts 10:34a, 37-43</a>`,
          bodyHtml: `<p>Peter proceeded to speak and said.</p>`,
        },
        {
          name: "Responsorial Psalm",
          addressHtml: `<a href="https://bible.usccb.org/bible/psalms/118?1">Ps 118:1-2, 16-17, 22-23</a>`,
          bodyHtml: `<p>R. This is the day the Lord has made.</p>`,
        },
        {
          name: "Reading 2",
          addressHtml: `<a href="https://bible.usccb.org/bible/colossians/3?1">Col 3:1-4</a>`,
          bodyHtml: `<p>Brothers and sisters: If then you were raised with Christ.</p>`,
        },
        {
          name: "Sequence",
          addressHtml: "",
          bodyHtml: `<p>Christians, to the Paschal Victim offer your thankful praises!</p>`,
        },
        {
          name: "Alleluia",
          addressHtml: `<a href="https://bible.usccb.org/bible/1corinthians/5?7">1 Cor 5:7b-8a</a>`,
          bodyHtml: `<p>R. Alleluia, alleluia.</p>`,
        },
        {
          name: "Gospel",
          addressHtml: `<a href="https://bible.usccb.org/bible/john/20?1">Jn 20:1-9</a>`,
          bodyHtml: `<p>On the first day of the week, Mary of Magdala came to the tomb early.</p>`,
        },
      ]
    );

    const mass = usccb.parseMass(
      html,
      "https://bible.usccb.org/bible/readings/042025.cfm",
      parseIsoDate("2025-04-20"),
      MassType.DEFAULT
    );

    expect(mass.sections.map((s) => s.type)).toEqual([
      SectionType.READING,
      SectionType.PSALM,
      SectionType.READING,
      SectionType.SEQUENCE,
      SectionType.ALLELUIA,
      SectionType.GOSPEL,
    ]);
    expect(mass.sections[3].readings[0].text).toContain("Paschal Victim");
  });

  it("parses Christmas Masses (Vigil, Night, Dawn, Day), Advent, Palm Sunday, Holy Thursday, Good Friday, Easter Vigil, and Major Solemnities", () => {
    const cases: Array<[string, string, MassType]> = [
      ["First Sunday of Advent", "113025.cfm", MassType.YEARA],
      [
        "The Nativity of the Lord (Christmas) Vigil",
        "122525-Vigil.cfm",
        MassType.VIGIL,
      ],
      [
        "The Nativity of the Lord (Christmas) Night",
        "122525-Night.cfm",
        MassType.NIGHT,
      ],
      [
        "The Nativity of the Lord (Christmas) Dawn",
        "122525-Dawn.cfm",
        MassType.DAWN,
      ],
      [
        "The Nativity of the Lord (Christmas) Day",
        "122525-Day.cfm",
        MassType.DAY,
      ],
      ["Palm Sunday of the Lord's Passion", "032926.cfm", MassType.DEFAULT],
      ["Thursday of the Lord's Supper", "040226.cfm", MassType.DEFAULT],
      [
        "Friday of the Passion of the Lord (Good Friday)",
        "040326.cfm",
        MassType.DEFAULT,
      ],
      ["The Easter Vigil in the Holy Night", "040426.cfm", MassType.VIGIL],
      ["Solemnity of All Saints", "110125.cfm", MassType.DEFAULT],
      ["Ordinary Time Weekday", "080625.cfm", MassType.DEFAULT],
      ["Sunday in Year B", "080424-YearB.cfm", MassType.YEARB],
      ["Sunday in Year C", "080325-YearC.cfm", MassType.YEARC],
    ];

    for (const [title, file, type] of cases) {
      const html = buildUsccbHtml(title, [
        {
          name: "Reading 1",
          addressHtml: `<a href="https://bible.usccb.org/bible/isaiah/52?7">Is 52:7-10</a>`,
          bodyHtml: `<p>How beautiful upon the mountains are the feet of him who brings glad tidings.</p>`,
        },
        {
          name: "Gospel",
          addressHtml: `<a href="https://bible.usccb.org/bible/john/1?1">Jn 1:1-18</a>`,
          bodyHtml: `<p>In the beginning was the Word.</p>`,
        },
      ]);

      const mass = usccb.parseMass(
        html,
        `https://bible.usccb.org/bible/readings/${file}`,
        parseIsoDate("2025-12-25"),
        type
      );
      expect(mass.title).toBe(title);
      expect(mass.type).toBe(type);
      expect(mass.sections).toHaveLength(2);
    }
  });

  it("handles plain-text address without anchor tags, alternative OR sections, missing content-body, and HTML entities", () => {
    const html = buildUsccbHtml("Alternative &amp; Optional Readings", [
      {
        name: "Reading 1",
        addressHtml: `Gen 1:1-5`,
        bodyHtml: `<p>In the beginning&nbsp;God created the heavens and the earth.</p><p>OR</p><p><a href="https://bible.usccb.org/bible/exodus/14?15">Ex 14:15-18</a></p><p>The LORD said to Moses.</p>`,
      },
      {
        name: "OR",
        addressHtml: `<a href="https://bible.usccb.org/bible/isaiah/55?1">Is 55:1-3</a>`,
        bodyHtml: `<p>All you who are thirsty, come to the water!</p>`,
      },
      {
        name: "Gospel",
        addressHtml: `<a href="https://bible.usccb.org/bible/mark/16?1">Mk 16:1-7</a>`,
        bodyHtml: `<p>When the sabbath was over, Mary Magdalene bought spices.</p>`,
      },
    ]);

    const mass = usccb.parseMass(
      html,
      "https://bible.usccb.org/bible/readings/041925-easter-vigil.cfm",
      parseIsoDate("2025-04-19"),
      "easter-vigil"
    );

    expect(mass.sections).toHaveLength(2);
    expect(mass.sections[0].readings).toHaveLength(3);
    expect(mass.sections[0].readings[0].verses[0].book).toBe("Genesis");
    expect(mass.sections[0].readings[0].text).toContain("beginning God");
    expect(mass.sections[0].readings[1].verses[0].book).toBe("Exodus");
    expect(mass.sections[0].readings[2].verses[0].book).toBe("Isaiah");
  });

  it("throws USCCBParseError when a reading has citation metadata but no .content-body", () => {
    const html = `<!DOCTYPE html>
<html>
  <head><title>Partial Container | USCCB</title></head>
  <body>
    <div class="container">
      <div class="name">Reading 1</div>
      <div class="address"><a href="https://bible.usccb.org/bible/genesis/1?1">Gen 1:1</a></div>
    </div>
  </body>
</html>`;

    expect(() =>
      usccb.parseMass(
        html,
        "https://bible.usccb.org/bible/readings/080625.cfm",
        parseIsoDate("2025-08-06"),
        MassType.DEFAULT
      )
    ).toThrow(USCCBParseError);
    expect(() =>
      usccb.parseMass(
        html,
        "https://bible.usccb.org/bible/readings/080625.cfm",
        parseIsoDate("2025-08-06"),
        MassType.DEFAULT
      )
    ).toThrow('USCCB reading section "Reading 1" is missing reading text');
  });

  it("throws USCCBParseError when a reading has citation metadata and an empty .content-body", () => {
    const html = `<!DOCTYPE html>
<html>
  <head><title>Empty Body Container | USCCB</title></head>
  <body>
    <div class="container">
      <div class="name">Gospel</div>
      <div class="address"><a href="https://bible.usccb.org/bible/john/1?1">Jn 1:1</a></div>
      <div class="content-body">   </div>
    </div>
  </body>
</html>`;

    expect(() =>
      usccb.parseMass(
        html,
        "https://bible.usccb.org/bible/readings/080625.cfm",
        parseIsoDate("2025-08-06"),
        MassType.DEFAULT
      )
    ).toThrow(USCCBParseError);
  });

  it("parses authentic Lenten Sunday HTML snapshot with Verse Before the Gospel", () => {
    const html = readFileSync(join(dataDir, "lent-first-sunday.html"), "utf-8");
    const mass = usccb.parseMass(
      html,
      "https://bible.usccb.org/bible/readings/030925.cfm",
      parseIsoDate("2025-03-09"),
      MassType.DEFAULT
    );

    expect(mass.title).toBe("First Sunday of Lent");
    expect(mass.sections.map((s) => s.type)).toEqual([
      SectionType.READING,
      SectionType.PSALM,
      SectionType.READING,
      SectionType.ALLELUIA,
      SectionType.GOSPEL,
    ]);
    expect(mass.sections[0].readings[0].verses[0].book).toBe("Deuteronomy");
    expect(mass.sections[3].header).toBe("Verse Before the Gospel");
    expect(mass.sections[3].readings[0].text).toContain(
      "Praise to you, Lord Jesus Christ"
    );
    expect(mass.sections[4].readings[0].verses[0].book).toBe("Luke");
  });

  it("parses authentic Easter Vigil HTML snapshot with interleaved psalms, OR alternative, and Epistle", () => {
    const html = readFileSync(join(dataDir, "easter-vigil.html"), "utf-8");
    const mass = usccb.parseMass(
      html,
      "https://bible.usccb.org/bible/readings/040426.cfm",
      parseIsoDate("2026-04-04"),
      MassType.VIGIL
    );

    expect(mass.title).toBe("The Easter Vigil in the Holy Night");
    expect(mass.sections.map((s) => s.type)).toEqual([
      SectionType.READING,
      SectionType.PSALM,
      SectionType.READING,
      SectionType.PSALM,
      SectionType.READING,
      SectionType.PSALM,
      SectionType.READING,
      SectionType.ALLELUIA,
      SectionType.GOSPEL,
    ]);
    expect(mass.sections[0].readings).toHaveLength(2);
    expect(mass.sections[0].readings[0].verses[0].book).toBe("Genesis");
    expect(mass.sections[0].readings[1].verses[0].text).toBe("Gn 1:1, 26-31a");
    expect(mass.sections[6].header).toBe("Epistle");
    expect(mass.sections[6].readings[0].verses[0].book).toBe("Romans");
    expect(mass.sections[8].readings[0].verses[0].book).toBe("Luke");
  });

  it("parses authentic Christmas Mass variant HTML snapshots (Vigil, Night, Dawn, Day)", () => {
    const variants: Array<{
      file: string;
      urlSuffix: string;
      type: MassType;
      expectedTitle: string;
      expectedFirstBook: string;
      expectedGospelReadings: number;
      expectedAlleluiaVerses: number;
    }> = [
      {
        file: "christmas-vigil.html",
        urlSuffix: "122525-Vigil.cfm",
        type: MassType.VIGIL,
        expectedTitle: "The Nativity of the Lord (Christmas) — Vigil Mass",
        expectedFirstBook: "Isaiah",
        expectedGospelReadings: 2,
        expectedAlleluiaVerses: 0,
      },
      {
        file: "christmas-night.html",
        urlSuffix: "122525-Night.cfm",
        type: MassType.NIGHT,
        expectedTitle:
          "The Nativity of the Lord (Christmas) — Mass during the Night",
        expectedFirstBook: "Isaiah",
        expectedGospelReadings: 1,
        expectedAlleluiaVerses: 1,
      },
      {
        file: "christmas-dawn.html",
        urlSuffix: "122525-Dawn.cfm",
        type: MassType.DAWN,
        expectedTitle: "The Nativity of the Lord (Christmas) — Mass at Dawn",
        expectedFirstBook: "Isaiah",
        expectedGospelReadings: 1,
        expectedAlleluiaVerses: 1,
      },
      {
        file: "christmas-day.html",
        urlSuffix: "122525-Day.cfm",
        type: MassType.DAY,
        expectedTitle:
          "The Nativity of the Lord (Christmas) — Mass during the Day",
        expectedFirstBook: "Isaiah",
        expectedGospelReadings: 2,
        expectedAlleluiaVerses: 0,
      },
    ];

    for (const v of variants) {
      const html = readFileSync(join(dataDir, v.file), "utf-8");
      const mass = usccb.parseMass(
        html,
        `https://bible.usccb.org/bible/readings/${v.urlSuffix}`,
        parseIsoDate("2025-12-25"),
        v.type
      );

      expect(mass.title).toBe(v.expectedTitle);
      expect(mass.type).toBe(v.type);
      expect(mass.sections.map((s) => s.type)).toEqual([
        SectionType.READING,
        SectionType.PSALM,
        SectionType.READING,
        SectionType.ALLELUIA,
        SectionType.GOSPEL,
      ]);
      expect(mass.sections[0].readings[0].verses[0].book).toBe(
        v.expectedFirstBook
      );
      expect(mass.sections[3].readings[0].verses).toHaveLength(
        v.expectedAlleluiaVerses
      );
      expect(mass.sections[4].readings).toHaveLength(v.expectedGospelReadings);
    }
  });
});

describe("getMassFromTrustedUrl with complex URLs", () => {
  it("recovers date and preserves unrecognized hyphenated suffix as string without assigning wrong MassType", async () => {
    const html = buildUsccbHtml("Christmas Vigil Mass", [
      {
        name: "Reading 1",
        addressHtml: `<a href="https://bible.usccb.org/bible/isaiah/62?1">Is 62:1-5</a>`,
        bodyHtml: `<p>For Zion's sake I will not be silent.</p>`,
      },
    ]);
    const usccb = new USCCB({
      async get(url: string) {
        return { text: html, ok: true, status: 200, url };
      },
      async head(url: string) {
        return { text: "", ok: true, status: 200, url };
      },
    });

    const mass = await usccb.getMassFromTrustedUrl(
      "https://mirror.example.org/bible/readings/122524-vigil-mass.cfm"
    );
    expect(mass).not.toBeNull();
    expect(mass!.date).toEqual(new Date(2024, 11, 25));
    expect(mass!.type).toBe("vigil-mass");
  });

  it("rejects URLs with whitespace or control characters", async () => {
    const usccb = new USCCB(noopClient);
    await expect(
      usccb.getMassFromTrustedUrl(
        "https://bible.usccb.org/bible/readings/080625.cfm\n"
      )
    ).rejects.toThrow(USCCBArgumentError);
  });
});

describe("getMassTypes and getMassTypesDetailed resilience", () => {
  it("falls back to GET when HEAD returns 405 or 501", async () => {
    let getCalls = 0;
    const usccb = new USCCB({
      async head(url: string) {
        return { text: "", ok: false, status: 405, url };
      },
      async get(url: string) {
        getCalls++;
        const isDay = url.includes("-Day.cfm");
        return { text: "", ok: isDay, status: isDay ? 200 : 404, url };
      },
    });

    const detailed = await usccb.getMassTypesDetailed(
      parseIsoDate("2025-12-25")
    );
    expect(detailed.complete).toBe(true);
    expect(detailed.types).toEqual([MassType.DAY]);
    expect(detailed.failedTypes).toEqual([]);
    expect(getCalls).toBe(Object.values(MassType).length);
  });

  it("distinguishes complete empty results from partial probe failures", async () => {
    const partialUsccb = new USCCB({
      async head(url: string) {
        if (url.includes("-Day.cfm")) {
          return { text: "", ok: true, status: 200, url };
        }
        if (url.includes("-Vigil.cfm")) {
          return { text: "", ok: false, status: 503, url };
        }
        return { text: "", ok: false, status: 404, url };
      },
      async get(url: string) {
        return { text: "", ok: false, status: 404, url };
      },
    });

    const partial = await partialUsccb.getMassTypesDetailed(
      parseIsoDate("2025-12-25")
    );
    expect(partial.complete).toBe(false);
    expect(partial.types).toEqual([MassType.DAY]);
    expect(partial.failedTypes).toEqual([MassType.VIGIL]);
    expect(partial.errors[MassType.VIGIL]?.name).toBe("USCCBNetworkError");
  });
});
