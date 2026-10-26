# Changelog

## [2.3.0](https://github.com/PuntjesApp/puntjes-typescript/compare/v2.2.0...v2.3.0) (2026-10-26)


### Features

* regenerate from puntjes-openapi v2.3.0 ([#20](https://github.com/PuntjesApp/puntjes-typescript/issues/20)) ([e491a88](https://github.com/PuntjesApp/puntjes-typescript/commit/e491a88b4231b45a6afafc0426128649b09a5313))

## [2.2.0](https://github.com/PuntjesApp/puntjes-typescript/compare/v2.1.0...v2.2.0) (2026-10-18)


### ⚠ Breaking

* The name `VerifyRedemptionData` now means the new body of `verifyRedemption` (`branch`, `idempotency_key`). The options type of that call is now `VerifyRedemptionData2`. Calls such as `verifyRedemption({ path: { code } })` still work. Code that names the type breaks.
  * before: `Options<VerifyRedemptionData>`, `VerifyRedemptionData['path']`
  * after: `Options<VerifyRedemptionData2>`, `VerifyRedemptionData2['path']`
* The `body` of seven request types is now optional, so `Data['body']` can be `undefined`: `RegisterCustomerData`, `ReplaceCustomerByExternalIdData`, `SendLoyaltyCardByExternalIdData`, `SendLoyaltyCardData`, `UpdateCustomerByExternalIdData`, `UpdateProductData2`, `VerifyVoucherData`. The `options` argument of `registerCustomer` is now optional too.
* These response types gained a required field, which breaks code that builds them by hand, such as test mocks: `branches` on `RedemptionCreatedData`, `RedemptionLookupData` and `RedemptionVerificationData`, `id` on `RedemptionRewardData`, `default_branch` on `VendorBrandingData`. `VerifyRedemptionErrors` gained status `400`.

### Features

* regenerate from puntjes-openapi v2.2.0 ([#9](https://github.com/PuntjesApp/puntjes-typescript/issues/9)) ([cec589e](https://github.com/PuntjesApp/puntjes-typescript/commit/cec589ef5e2570299fb253c08f632836967cd77f))

## [2.1.0](https://github.com/PuntjesApp/puntjes-typescript/compare/v2.0.0...v2.1.0) (2026-10-15)


### Features

* regenerate from puntjes-openapi v2.1.0 ([#7](https://github.com/PuntjesApp/puntjes-typescript/issues/7)) ([9fe3496](https://github.com/PuntjesApp/puntjes-typescript/commit/9fe349678b46dd9a42aab32f4fb17b625c90e763))

## [2.0.0](https://github.com/PuntjesApp/puntjes-typescript/compare/v1.0.0...v2.0.0) (2026-10-12)


### ⚠ BREAKING CHANGES

* regenerate from puntjes-openapi v2.0.0 ([#5](https://github.com/PuntjesApp/puntjes-typescript/issues/5))

### Features

* regenerate from puntjes-openapi v2.0.0 ([#5](https://github.com/PuntjesApp/puntjes-typescript/issues/5)) ([4629700](https://github.com/PuntjesApp/puntjes-typescript/commit/4629700e912c94a4d8bf0b1565ab6512a3bce322))

## 1.0.0 (2026-10-11)


### Features

* @puntjes/sdk, a hey-api client with a thin layer, regenerate robot and npm release ([#1](https://github.com/PuntjesApp/puntjes-typescript/issues/1)) ([a771150](https://github.com/PuntjesApp/puntjes-typescript/commit/a771150d5994945d9709de8436b21d3c8eaa85d8))
