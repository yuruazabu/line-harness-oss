// ゆる麻布 fork 版のバージョン刻印（手動管理）。
//
// upstream ではこのファイルはリリースCIが scripts/inject-version.ts で生成する。
// この fork では **意図的に手で書いている**。理由:
//
//   `line-harness update` は本番の /admin/version を読み、マニフェストのハッシュと
//   突き合わせて挙動を分ける（create-line-harness/src/commands/update.ts:502-524）。
//     - version がマニフェストに無い   → adoption を提案（バニラで上書き = 改造が消える）
//     - version は既知 × ハッシュ不一致 → 「カスタマイズ版」と判定して安全にスキップ
//
//   そこで version は既知の 0.17.0 を名乗り、WORKER_HASH だけ実ビルドの値にする。
//   これで update を実行しても改造が黙って上書きされない。
//   （dev スタブの 0.0.0-dev のままだと前者に落ちるため、これは改善でもある）
//
// ADMIN_HASH / LIFF_HASH は 0.17.0 リリースの値をそのまま使う。この fork は worker しか
// 変更しておらず、管理画面・LIFF はリリース版がデプロイされたままのため。
//
// upstream を取り込んで再デプロイしたら WORKER_HASH を新ビルドの sha256 に更新すること。
// 手順は yuruazabu-line-harness/docs/fork-operations.md を参照。
export const BUNDLE_VERSION = '0.17.0';
export const WORKER_HASH = 'sha256:b132a39d031f737b2b5ae0268519abbc63e30498fab23bad8c7748923f1b78d0';
export const ADMIN_HASH = 'sha256:24f2e7900f9fb2adc28d4e9d49f78832f67b9a24abca08b69e3b40e1bf4557d3';
export const LIFF_HASH = 'sha256:deea955f0a43224bb582e91baff0a52dea5731e94487a4a0839d3f9661db9d5e';
export const RELEASED_AT = '2026-07-07T16:39:57.344Z';
