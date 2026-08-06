// 復号後の機密データを保持する器。平文データは持たない（Gate が復号して注入する）。
// App はここから経営数字(pharmacies)・医師名(doctors)・法人人件費(corpLabor)を読む。
export const seed = { pharmacies: [], doctors: {}, corpLabor: {} };

export function applySeed(data) {
  seed.pharmacies = data.pharmacies || [];
  seed.doctors = data.doctors || {};
  seed.corpLabor = data.corpLabor || {};
}
