# [1.1.0-alpha.3](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/compare/v1.1.0-alpha.2...v1.1.0-alpha.3) (2026-06-25)


### Bug Fixes

* **annotations:** never rewrite IIIF Content Search responses ([2abd566](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/2abd56667b22ed78ccf58d6efab0e8f10a986075))
* **dataset:** download a protected resource via <a download>, signing in inline ([e4f909a](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/e4f909aec8368bc3f5f197791cace43b85b57a7b))
* **mirador-auth:** match an access profile anywhere in a profile array ([e7f9af0](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/e7f9af087ef8cc4bd7e40668fa795f0436ce605b))
* **mirador-auth:** open the login window synchronously from the click ([34341ca](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/34341cacafc30acf31e4a9ed7942986006b031f3))
* **mirador-auth:** re-acquire on 401 instead of trusting a stale stored token ([06fa31b](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/06fa31ba317d3ed5389e92aca3e3e9427df9dd07))
* **mirador-auth:** strip trailing dots in linear time (ReDoS) ([ea61cef](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/ea61cef37d0deeed0c12e2a6d1926d124b43aa45))


### Features

* **annotations:** preserve declared IIIF Auth service through normalization ([7fd4d6d](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/7fd4d6db12df3e88f9714a7181da335d5cab31b6))
* **datasets:** download data file in the spectrum plot ([0fd5fb0](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/0fd5fb02fb49e38b7845bbbf50bb18125743849a))
* **datasets:** download protected files with the token; recover silently on reload ([1a7a203](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/1a7a2030101a86cf2c6b2a7ebf0221a44421cf66))
* **datasets:** hide the dead Sign-in button and add a signing-in state ([8f30adb](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/8f30adbd1fa8e45c1db2a2154f22f85bc2a12d0a))
* **datasets:** IIIF Auth support for access-controlled datasets ([7bdad2e](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/7bdad2eb59eeedca88704dad1d8462095636c87a))
* **datasets:** thread a per-request service context through dataset fetches ([38b82b9](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/38b82b9f11f6c2d08969b8cc2f21a2565edcf151))
* **iiif:** add IiifService interface for Auth service representation ([653498f](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/653498ff7fff691cad983852f109216249374b23))
* **mirador-auth:** add an SSRF blocklist for credentialed dataset hosts ([3282b3c](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/3282b3c6778c8fdb992c91ae5bd3e70c3d9ec71d))
* **mirador-auth:** add origin-checked IIIF Auth 1.0 login driver ([a1794c3](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/a1794c3a42483a2996e0ea11a95b3906f7055465))
* **mirador-auth:** discover the declared IIIF Auth access service ([2fbaed2](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/2fbaed287deca1887c891bb2245f237c4fd4053f))
* **mirador-auth:** enforce the SSRF blocklist and scope host-driven login ([cc02bca](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/cc02bca76485f0d110b31f0aff4e90b7ffb2b8c6))
* **mirador-auth:** expose a canStartLogin predicate for the Sign-in affordance ([9384c76](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/9384c765d19e885177936ffc7b3c40a1f2953eb5))
* **mirador-auth:** forward declared service from Mirador wiring, document trust model ([e29bcad](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/e29bcad886ac5bff9962903448edc68e25b19790))
* **mirador-auth:** make trustedOrigins optional with a host-driven default ([8349a69](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/8349a69e25488e614bbc0a161ec45699b8448208))
* **mirador-auth:** reload the image ([a4759ce](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/a4759cec06f2bf4925d3f45cf38ce113c5de38d7))
* **mirador-auth:** resolve tokens by the resource's declared auth service ([612373c](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/612373cb1f82a9fe35d719b3b4fbba80afd28dbb))
* **mirador-auth:** reuse Mirador IIIF Auth session for same-host datasets ([3b36a2a](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/3b36a2ad167b2f35b45c2ab846e69d77e7245cd7))
* **mirador-auth:** reuse the IIIF session — one login, silent reload re-acquire, popup ([97623b6](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/97623b606bc0b800fc63f762d40c57addb0910d2))
* **mirador-auth:** trigger a trusted login on Sign-in for declared-service dataset ([b64fe83](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/b64fe83f0784d72295ca71c0ebe6b1d3dde80b40))

# [1.1.0-alpha.2](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/compare/v1.1.0-alpha.1...v1.1.0-alpha.2) (2026-06-19)


### Bug Fixes

* **dataset:** link to the resource for formats that can't be plotted ([af72c7b](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/af72c7b09b53e3c85dee59a691d7c893eeb30c33))
* **ui:** anchor the metadata filter tooltip to the floating button ([67ea747](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/67ea7478cc62a21afc87b131ab44681045947dc7))
* **ui:** wrap disabled filter buttons in a span for MUI Tooltip ([128c0ee](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/128c0ee529499a361cd260678f522ca3f0170000))
* update v2 localized value handling to support mixed arrays per IIIF Presentation 2.1 ([c47d84e](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/c47d84e69dda9ef2264651e41572903c7dfd78fa))


### Features

* **annotations:** add IIIF v2→v3 annotation normalizer ([52907b8](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/52907b8931dad92f2fe03a42e5bbda4a9c421804))
* **annotations:** render annotations on canvas for any IIIF version ([20723da](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/20723da82eba3e26e1c533a27e86b0eb17757fd8))


### Performance Improvements

* **annotations:** memoize normalized resources to stabilize mapStateToProps ([a0db545](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/a0db545a4d968575277d085fadb26c2d02dd657b))

# [1.1.0-alpha.1](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/compare/v1.0.0...v1.1.0-alpha.1) (2026-06-09)


### Bug Fixes

* **cache:** prevent unhandled rejection from pending-request cleanup ([141526e](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/141526e28c20e84fa4dc4e507c93788a1d185d05))
* **ci:** align node and checkout versions across workflows ([7b657fa](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/7b657fa85b2dece538f6290412479181c3f87129))
* **ci:** remove non-blocking security audit step from CI workflow ([a9a0c1d](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/a9a0c1d16c64dac80280d7a6f4a5ff45b7e48522))
* **ci:** scope job permissions and add timeouts to all workflows ([cda2bfb](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/cda2bfbb0bf6fff45c99ce7f54cafd0af1380369))
* **ci:** update actions/checkout to v6 in CI workflows ([730b5b8](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/730b5b8ffbec1bfebd36362bcfe556985c3c928d))
* **ci:** update CodeQL action to v4 and adjust job configuration ([21aa0e4](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/21aa0e47dbdd96251139bbe9f6ec6a2d98c72038))
* **plot:** clamp Dialog Paper minimum dimensions to viewport ([c102131](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/c10213108f94785ad277982d7d3ba407b5f00b9e))
* **plot:** clone layout and traces for modal Plot to prevent Plotly mutation leak ([7106a1c](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/7106a1c65733828231ff1d5ef253156e050d4f61))
* **plot:** concat expand button with baseConfig modeBarButtonsToAdd ([ae6e84f](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/ae6e84fe7ba0abb14ba97cc84e7e2f6d8c372300))
* **plot:** concat expand button with baseConfig modeBarButtonsToAdd ([2e5136e](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/2e5136e39ddd688d9495525872cef26630f02b3c))
* **plot:** constrain DialogTitle width so noWrap ellipsizes long labels ([f0a3ded](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/f0a3dedee0e2642ccb590e5849389ab062200cdd))
* **plot:** default enableExpand to false to preserve public API ([011b392](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/011b3923eafc3a8b2dd683a3baf271c15761c2c7))
* **plot:** guard legacy data.points fallback  against undefined ([8311215](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/8311215c0f06f713387362b82fa351a5a6a24467))
* **plot:** keep Dialog mounted to preserve MUI exit transition and focus restore ([156ba0a](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/156ba0a18c71a7cdf1bd0b52fbf244b500f09575))
* **plot:** move close button outside DialogTitle heading and label the dialog ([6eb737d](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/6eb737dbf823f5293594a7aadec752da62bc5742))
* **plot:** tighten typing of modeBarButtonsToAdd concat ([708ff1e](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/708ff1ee39baf8790ca9e948fe994a756237725e))
* **plot:** treat empty xValues array as missing to fall back to legacy points ([00a3858](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/00a38583d90d64286ce70a5db09c49b5119f2882))
* **plot:** use useLayoutEffect to size modal Plot before paint ([c971523](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/c971523a95b11c646ab18eaa2fc3ede493ad9152))
* **release:** consolidate semantic-release config in .releaserc.json ([7feac5a](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/7feac5aa1888be5dd3e412c6075c809e4753030f))
* update node engine requirement to >=22 ([104f457](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/104f457cab4771c83543d367b1ec45609e0e4a95))


### Features

* **ci:** add Dependabot configuration and enhance CI workflows with CodeQL analysis and coverage reporting ([a6336c0](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/a6336c0e3c72e0550d71d4d9b6127c389b56c201))
* **ci:** add dependency review step to CI workflow for improved vulnerability tracking ([bdf57ce](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/bdf57ce6a41bc947c1803d331b7d753429f0eff1))
* **plot:** add expand-to-modal button in Plotly modebar ([10cdee1](https://github.com/CRC-Centre-Recherche-Conservation/mirador-xyviewer/commit/10cdee1f1bbd05718aae752ebb577c0b0fdb618c))

# Changelog

## 1.0.0-alpha (2026-02-09)

### Features

* Initial alpha release of mirador-xyviewer — a Mirador plugin for XY spectrum visualization on IIIF images.
