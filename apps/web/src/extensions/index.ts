// うちの拡張の登録簿。
//
// ★★ **本家のファイルを触らずに機能を足すための、たった1つの口。**
//
//   これを入れる前は、機能を1つ足すたびに sidebar.tsx / api.ts / event-bus.ts /
//   types.ts の同じ数ファイルに差し込んでいた。Slack連携1本で**既存ファイルに319行**。
//   このやり方だと機能が増えるほど同じ場所で衝突が重なり、本家の追随が重くなる
//   (2026-08-22 に実測して判明)。
//
//   代わりに、**本家側は「この登録簿を読む1行」だけ**にして、
//   うちの機能はここに足す。以後どれだけ機能が増えても、本家への差し込みは増えない。
//
// ★ **ここに機能の中身を書かない。** 中身は別ファイルに置いて、ここは登録だけにする。
//   ここが太ると、結局この1ファイルが衝突点になる。
//
// ★ **まず「フォークの外に置けないか」を先に考える。**
//   顧客に見せる画面・課金・招待・ダッシュボードは control-plane に置ける。
//   本家の送信Webhook・自動化ルールで足りるものもある。
//   ここを使うのは「**本家の管理画面の中に出す**」ものだけ。

/** サイドバーに足す項目 */
export interface NavItem {
  /** 遷移先。**外部URLも可**(SaaS側のマイページへ飛ばすときに使う) */
  href: string;
  label: string;
  /** SVG の d 属性。本家の項目と同じ描き方 */
  icon: string;
  /** 本家のどのセクションに入れるか。無ければ末尾の独立セクション */
  section?: string;
  /** 別タブで開く(外部URLのとき) */
  external?: boolean;
}

/**
 * サイドバーに足す項目。
 *
 * ★ いまは空。足すときはここに1行書く。
 */
export const navItems: NavItem[] = [
  {
    href: "/notify",
    label: "通知",
    // ベル
    icon: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
  },
];

// ─────────────────────────────────────────────────────────────────────
// ダッシュボードに足すカード
// ─────────────────────────────────────────────────────────────────────

/**
 * ダッシュボードの一番上に出す数字。
 *
 * ★ 本家の「配信数(合計)」は**一斉配信を何本作ったか**で、3通送っても
 *   10万通送っても「1」。課金に直結する「今月あと何通送れるか」は
 *   管理画面から見えなかった(2026-08-23)。それをここで出す。
 */
export interface StatSlot {
  /** 見出し */
  title: string;
  /** 値を取ってくる。null を返すと「-」を出す */
  load: () => Promise<{ value: number | null; sub?: string; href?: string }>;
  accentColor?: string;
  /** SVG の d 属性 */
  icon: string;
}

/** 今月の配信通数。**正本は control-plane。ここでは数えない** */
const monthlyUsage: StatSlot = {
  title: "今月の配信通数",
  accentColor: "#06C755",
  icon: "M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z",
  load: async () => {
    // ★ ラッパーが返す。**新しく数えない** — 配信の判定のために既に引いている値
    const res = await fetch("/api/__usage", { credentials: "same-origin" });
    if (!res.ok) return { value: null };
    const d = (await res.json()) as {
      available?: boolean; used?: number; limit?: number | null; portalOrigin?: string;
    };
    if (!d.available) return { value: null };
    const used = Number(d.used ?? 0);
    return {
      value: used,
      // ★ 上限が無い(プレミアム)ときに「/ null」と出さない
      sub: d.limit == null ? "上限なし" : `${used.toLocaleString("ja-JP")} / ${d.limit.toLocaleString("ja-JP")} 通`,
      // 詳しい推移はマイページにある。**ここで作り直さない**
      href: d.portalOrigin ? `${d.portalOrigin}/` : undefined,
    };
  },
};

/**
 * ダッシュボードに足すカード。
 *
 * ★ 足すときはここに1行。**中身はこのファイルの外に置く**のが望ましいが、
 *   いまは1枚だけなのでここに書いている。2枚目を足すときに分ける。
 */
export const statSlots: StatSlot[] = [monthlyUsage];
