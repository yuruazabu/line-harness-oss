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
    label: "通知の連携",
    // ★ 「自動化」に入れる。末尾の独立セクションだと見つからなかった(2026-08-23)
    section: "自動化",
    // ★ ベルは本家の「未対応」が使っている。**紙飛行機**にして見分けられるようにする
    icon: "M12 19l9 2-9-18-9 18 9-2zm0 0v-8",
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
    // ★★ **相対パスで叩かない。** 中継構成では画面が app.hrns.jp/t/{契約}/console/
    //   に出るので、`/api/__usage` は**契約の外(ポータルの根)へ落ちて401になる**。
    //   本体と同じ土台(NEXT_PUBLIC_API_URL)から組む(2026-08-23)。
    const base = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
    const res = await fetch(`${base}/api/__usage`, { credentials: "include" });
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
