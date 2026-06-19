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
