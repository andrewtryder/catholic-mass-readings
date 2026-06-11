export declare const SUNDAY_DAY_OF_WEEK = 0;
export declare const DATE_FMT: RegExp;
export declare const OR_PATTERN: RegExp;
export declare const READING_TITLE_FMT = "A reading from the {TITLE}";
export declare const DAILY_READING_DEFAULT_MSS_URL_FMT = "https://bible.usccb.org/bible/readings/{DATE}.cfm";
export declare const DAILY_READING_DAWN_MASS_URL_FMT = "https://bible.usccb.org/bible/readings/{DATE}-Dawn.cfm";
export declare const DAILY_READING_DAY_MASS_URL_FMT = "https://bible.usccb.org/bible/readings/{DATE}-Day.cfm";
export declare const DAILY_READING_NIGHT_MASS_URL_FMT = "https://bible.usccb.org/bible/readings/{DATE}-Night.cfm";
export declare const DAILY_READING_VIGIL_MASS_URL_FMT = "https://bible.usccb.org/bible/readings/{DATE}-Vigil.cfm";
export declare const DAILY_READING_YEAR_A_MASS_URL_FMT = "https://bible.usccb.org/bible/readings/{DATE}-YearA.cfm";
export declare const DAILY_READING_YEAR_B_MASS_URL_FMT = "https://bible.usccb.org/bible/readings/{DATE}-YearB.cfm";
export declare const DAILY_READING_YEAR_C_MASS_URL_FMT = "https://bible.usccb.org/bible/readings/{DATE}-YearC.cfm";
export declare const READING_CLOSE_REMARKS = "The word of the Lord.";
export declare const READING_CLOSE_RESPONSE = "Thanks be to God.";
export declare const GOSPEL_CLOSE_RESPONSE = "Praise to you, Lord Jesus Christ.";
export declare const GOSPEL_CLOSE_REMARKS = "The Gospel of the Lord.";
export declare const SECTION_HEADER_FIRST_READING = "First Reading";
export declare const SECTION_HEADER_SECOND_READING = "Second Reading";
export declare const SECTION_HEADER_THIRD_READING = "Third Reading";
export declare const SECTION_HEADER_FOURTH_READING = "Fourth Reading";
export declare const SECTION_HEADER_READINGS: Record<number, string>;
export interface BibleBook {
    short_abbreviation: string;
    long_abbreviation: string;
    name: string;
    title: string;
}
export declare const OLD_TESTAMENT_BOOKS: BibleBook[];
export declare const NEW_TESTAMENT_BOOKS: BibleBook[];
//# sourceMappingURL=constants.d.ts.map