# Changelog

## [0.4.1](https://github.com/andrewtryder/catholic-mass-readings/compare/v0.4.0...v0.4.1) (2026-07-20)


### Bug Fixes

* address range semantics, verse fallbacks, and probe resilience ([f01328b](https://github.com/andrewtryder/catholic-mass-readings/commit/f01328ba36a91d3446bcd59b2d1eeab9e65d2e11))

## [0.4.0](https://github.com/andrewtryder/catholic-mass-readings/compare/v0.3.5...v0.4.0) (2026-07-20)


### Features

* add typescript library and cli for usccb mass readings ([de1896d](https://github.com/andrewtryder/catholic-mass-readings/commit/de1896d611be6ddbb453f32f8d24724055d36589))
* prepare library for public npm release ([44f00fc](https://github.com/andrewtryder/catholic-mass-readings/commit/44f00fc7a93276a7f43d4782ceaeba7c104d8afc))


### Bug Fixes

* build dist on install for github dependencies ([caa0037](https://github.com/andrewtryder/catholic-mass-readings/commit/caa0037723bd942afa211c2994a01ffd4cb0e079))
* **ci:** remove invalid renovate major grouping rule ([340d452](https://github.com/andrewtryder/catholic-mass-readings/commit/340d452b695ee798f9a6d01fee823d6202f25e2e))
* **ci:** remove invalid renovate major grouping rule ([93e4bf1](https://github.com/andrewtryder/catholic-mass-readings/commit/93e4bf1cc766399bbbccce8a9f030e98016769e6)), closes [#2](https://github.com/andrewtryder/catholic-mass-readings/issues/2)
* **ci:** run npm publish and docs deploy from release-please ([41c2743](https://github.com/andrewtryder/catholic-mass-readings/commit/41c2743862349dfb8cbd789a1abbdc49e6c1c8ef))
* **cli:** parse obolus config with double-quoted html fixtures ([80bf581](https://github.com/andrewtryder/catholic-mass-readings/commit/80bf581914d758356be5affe10f083429ac9c0e6))
* **cli:** resolve recursive logger call and add process tests ([9a38b2a](https://github.com/andrewtryder/catholic-mass-readings/commit/9a38b2a1fd26bbb94520af024610e45af6da0dc5))
* **cli:** resolve recursive logger call and add process tests ([9202271](https://github.com/andrewtryder/catholic-mass-readings/commit/92022712f903852de1c0ca3729e32b9b1796d909))
* **cli:** solve usccb obolus proof-of-work bot check ([50b722b](https://github.com/andrewtryder/catholic-mass-readings/commit/50b722bb96b9b51fb73e9cba1d4f527abfc10fd7))
* **cli:** solve usccb obolus proof-of-work bot check ([59bafec](https://github.com/andrewtryder/catholic-mass-readings/commit/59bafec4520660f596af6a41fe2f3f8db48e65ef))
* commit dist for github dependency installs ([371749a](https://github.com/andrewtryder/catholic-mass-readings/commit/371749afef488dd4b9f0f6680c8fb43c06d72b09))
* **deps:** update major dependency updates ([#14](https://github.com/andrewtryder/catholic-mass-readings/issues/14)) ([346ff2b](https://github.com/andrewtryder/catholic-mass-readings/commit/346ff2bae31b4fa5f60f18b8b34f6ef78a2324b0))
* enforce http resource limits and proof-of-work boundaries ([d4bb3ba](https://github.com/andrewtryder/catholic-mass-readings/commit/d4bb3ba5179de9c2e8a97ae313bd8b300ec097aa))
* **fetch:** improve live request reliability and sanitize docs ([#13](https://github.com/andrewtryder/catholic-mass-readings/issues/13)) ([9f05c89](https://github.com/andrewtryder/catholic-mass-readings/commit/9f05c894bf656c05d3dd38b65a9c81e0c7f56c25))
* **http:** enforce request limits, timeouts, and challenge bounds ([110b3fa](https://github.com/andrewtryder/catholic-mass-readings/commit/110b3fa27fd38deb1c0b39ca862625d259b1fc01))
* improve robustness and error handling ([ccebafd](https://github.com/andrewtryder/catholic-mass-readings/commit/ccebafdde14721b5c1759583a54b5936e8ca70e8))
* improve robustness and error handling ([80bc4f9](https://github.com/andrewtryder/catholic-mass-readings/commit/80bc4f96531c6fa3130277a79281bbf22e96629b))
* **parser:** add contract validation for parsed mass pages ([7b814b4](https://github.com/andrewtryder/catholic-mass-readings/commit/7b814b4dad7153fbbadaae405f2ab632a3105f91))
* **parser:** add contract validation for parsed mass pages ([508487e](https://github.com/andrewtryder/catholic-mass-readings/commit/508487e90ef10031c86f778d820cded60dd28733))
* scope obolus state and validate usccb urls ([f5e3e52](https://github.com/andrewtryder/catholic-mass-readings/commit/f5e3e52b9166f1659801b7f8443bd7702ee96161))
* scope obolus state and validate usccb urls ([9817c09](https://github.com/andrewtryder/catholic-mass-readings/commit/9817c09154022113adfa3be854a49945e9553d42))
* **usccb:** validate date boundaries and range step parameter ([1ad0bff](https://github.com/andrewtryder/catholic-mass-readings/commit/1ad0bff6df5e376097bf7e78f683e837ae4cb181))
* **usccb:** validate date boundaries and range step parameter ([1149730](https://github.com/andrewtryder/catholic-mass-readings/commit/114973091e5ca4e6c1c96b55a616a68bfd33ef46))


### Performance Improvements

* **cli:** optimize mass type enum lookup inside for-loop ([a458c73](https://github.com/andrewtryder/catholic-mass-readings/commit/a458c73e1aa0ca45795dfb0687909c0f1f67cc2e))
* **cli:** precompute reverse MassType lookup map ([71101eb](https://github.com/andrewtryder/catholic-mass-readings/commit/71101eb391c8fb968500e1fab396919004f6d51c))
* **models:** optimize readingTitle verse traversal ([2fe83bb](https://github.com/andrewtryder/catholic-mass-readings/commit/2fe83bb1fbe9794fb72ab45babc75135bbb87fd8))
* **models:** precompute parseMassType lookup map ([2c2a37b](https://github.com/andrewtryder/catholic-mass-readings/commit/2c2a37b8186ec50c91269423a6580d9b55f60eed))
* optimize parsemasstype using a lookup map ([6ac6a04](https://github.com/andrewtryder/catholic-mass-readings/commit/6ac6a04cbbb98be0f4a42fe3f131c0776e1856e0))
* optimize parsemasstype using a lookup map ([090f907](https://github.com/andrewtryder/catholic-mass-readings/commit/090f9074443a03005462c2b3b4dd5bf2068b3d62))
* optimize parsemasstype using a lookup map ([839ce03](https://github.com/andrewtryder/catholic-mass-readings/commit/839ce0347098b2ead02f910b1f0b111aacff4c3d))
* optimize parseMassType using a lookup map ([39cb59d](https://github.com/andrewtryder/catholic-mass-readings/commit/39cb59d9fd7e0c0e0d272e9acde42d0938b3ee7f))
* optimize reading title verse traversal ([7ba8202](https://github.com/andrewtryder/catholic-mass-readings/commit/7ba8202e9f00d5bc38ad0d491da23fd9b9bfc41d))
* optimize reading title verse traversal ([55d536b](https://github.com/andrewtryder/catholic-mass-readings/commit/55d536be3a501a3eb3cc11b5319ade942931c2ba))
* optimize reading title verse traversal ([26fa706](https://github.com/andrewtryder/catholic-mass-readings/commit/26fa70655c843672f201f00b7e6fbc553a2bdf11))
* optimize reading title verse traversal ([845233f](https://github.com/andrewtryder/catholic-mass-readings/commit/845233f565c3a270f59d0db575b122850bcff660))

## [0.3.5](https://github.com/andrewtryder/catholic-mass-readings/compare/catholic-mass-readings-v0.3.4...catholic-mass-readings-v0.3.5) (2026-06-19)


### Bug Fixes

* improve robustness and error handling ([ccebafd](https://github.com/andrewtryder/catholic-mass-readings/commit/ccebafdde14721b5c1759583a54b5936e8ca70e8))
* improve robustness and error handling ([80bc4f9](https://github.com/andrewtryder/catholic-mass-readings/commit/80bc4f96531c6fa3130277a79281bbf22e96629b))

## [0.3.4](https://github.com/andrewtryder/catholic-mass-readings/compare/catholic-mass-readings-v0.3.3...catholic-mass-readings-v0.3.4) (2026-06-12)


### Bug Fixes

* **deps:** update major dependency updates ([#14](https://github.com/andrewtryder/catholic-mass-readings/issues/14)) ([346ff2b](https://github.com/andrewtryder/catholic-mass-readings/commit/346ff2bae31b4fa5f60f18b8b34f6ef78a2324b0))

## [0.3.3](https://github.com/andrewtryder/catholic-mass-readings/compare/catholic-mass-readings-v0.3.2...catholic-mass-readings-v0.3.3) (2026-06-12)


### Bug Fixes

* **ci:** remove invalid renovate major grouping rule ([340d452](https://github.com/andrewtryder/catholic-mass-readings/commit/340d452b695ee798f9a6d01fee823d6202f25e2e))
* **fetch:** improve live request reliability and sanitize docs ([#13](https://github.com/andrewtryder/catholic-mass-readings/issues/13)) ([9f05c89](https://github.com/andrewtryder/catholic-mass-readings/commit/9f05c894bf656c05d3dd38b65a9c81e0c7f56c25))

## [0.3.2](https://github.com/andrewtryder/catholic-mass-readings/compare/catholic-mass-readings-v0.3.1...catholic-mass-readings-v0.3.2) (2026-06-11)


### Bug Fixes

* **cli:** parse obolus config with double-quoted html fixtures ([80bf581](https://github.com/andrewtryder/catholic-mass-readings/commit/80bf581914d758356be5affe10f083429ac9c0e6))
* **cli:** solve usccb obolus proof-of-work bot check ([50b722b](https://github.com/andrewtryder/catholic-mass-readings/commit/50b722bb96b9b51fb73e9cba1d4f527abfc10fd7))
* **cli:** solve usccb obolus proof-of-work bot check ([59bafec](https://github.com/andrewtryder/catholic-mass-readings/commit/59bafec4520660f596af6a41fe2f3f8db48e65ef))

## [0.3.1](https://github.com/andrewtryder/catholic-mass-readings/compare/catholic-mass-readings-v0.3.0...catholic-mass-readings-v0.3.1) (2026-06-11)


### Bug Fixes

* **ci:** run npm publish and docs deploy from release-please ([41c2743](https://github.com/andrewtryder/catholic-mass-readings/commit/41c2743862349dfb8cbd789a1abbdc49e6c1c8ef))

## [0.3.0](https://github.com/andrewtryder/catholic-mass-readings/compare/catholic-mass-readings-v0.2.0...catholic-mass-readings-v0.3.0) (2026-06-11)


### Features

* add typescript library and cli for usccb mass readings ([de1896d](https://github.com/andrewtryder/catholic-mass-readings/commit/de1896d611be6ddbb453f32f8d24724055d36589))
* prepare library for public npm release ([44f00fc](https://github.com/andrewtryder/catholic-mass-readings/commit/44f00fc7a93276a7f43d4782ceaeba7c104d8afc))


### Bug Fixes

* build dist on install for github dependencies ([caa0037](https://github.com/andrewtryder/catholic-mass-readings/commit/caa0037723bd942afa211c2994a01ffd4cb0e079))
* commit dist for github dependency installs ([371749a](https://github.com/andrewtryder/catholic-mass-readings/commit/371749afef488dd4b9f0f6680c8fb43c06d72b09))

## [0.2.0](https://github.com/andrewtryder/catholic-mass-readings/compare/catholic-mass-readings-v0.1.0...catholic-mass-readings-v0.2.0) (2026-06-11)


### Features

* add typescript library and cli for usccb mass readings ([de1896d](https://github.com/andrewtryder/catholic-mass-readings/commit/de1896d611be6ddbb453f32f8d24724055d36589))
* prepare library for public npm release ([44f00fc](https://github.com/andrewtryder/catholic-mass-readings/commit/44f00fc7a93276a7f43d4782ceaeba7c104d8afc))


### Bug Fixes

* build dist on install for github dependencies ([caa0037](https://github.com/andrewtryder/catholic-mass-readings/commit/caa0037723bd942afa211c2994a01ffd4cb0e079))
* commit dist for github dependency installs ([371749a](https://github.com/andrewtryder/catholic-mass-readings/commit/371749afef488dd4b9f0f6680c8fb43c06d72b09))
