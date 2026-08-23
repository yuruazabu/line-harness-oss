/**
 * 友だち(エンドユーザー)や LINE Developers Console が開くURLの土台。
 *
 * ★★ **API の向き先とは別物。**
 *   管理画面が中継ごしに配信される構成では、API は中継のパスへ向く
 *   (`NEXT_PUBLIC_API_URL`)。しかし **webhook・OAuthコールバック・LIFF・
 *   計測リンクは、テナント自身の公開オリジンでなければならない。**
 *   これらは LINE 側に登録され、配信メッセージに焼き込まれるため、
 *   **一度配ったら二度と変えられない**。
 *   ここを API の向き先から作ると、中継のURLを LINE に登録させてしまい、
 *   配信が壊れる。
 *
 * ★ `NEXT_PUBLIC_PUBLIC_URL` が無ければ `NEXT_PUBLIC_API_URL` に落ちる。
 *   従来のインストール(両者が同じホスト)は何も設定しなくても今までどおり動く。
 */
export function publicBase(): string {
  const v = process.env.NEXT_PUBLIC_PUBLIC_URL || process.env.NEXT_PUBLIC_API_URL || ''
  return v.replace(/\/$/, '')
}
