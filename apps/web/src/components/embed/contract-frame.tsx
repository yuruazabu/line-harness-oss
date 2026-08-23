'use client'

// 契約まわりの画面(請求・お問い合わせ・AI連携・アカウント・契約の切り替え)を
// **この画面の右側にそのまま置く**ための枠。
//
// ★★ **なぜ枠なのか。** これらの画面は control-plane 側にあり、
//   Stripe・領収書・解約の段取りといった「金に触るロジック」を持っている。
//   こちらへ書き写すと、写し間違いがそのまま金の事故になるうえ、
//   本家を上げるたびに突き合わせる量が増える。**動いているものをそのまま置く。**
//
// ★★ **飛ばさない。** 別URLへ遷移させると、サイドバーごと入れ替わって
//   戻り道が消える(2026-08-23 ひろさん指摘「別のシステムに飛んで、
//   戻り方がわからず違和感しかない」)。**入れ替わるのは右側だけ。**
//
// ★ 同一オリジンなので、ログインはそのまま引き継がれる。
//   高さは中身から postMessage で受け取って枠ごと伸ばす
//   (枠内にもう1つスクロールを作らない)。

import { useEffect, useRef, useState } from 'react'

export default function ContractFrame({
  path,
  title,
  onTitle,
}: {
  path: string
  title: string
  /** 枠の中で画面が移ったときの見出し。上の見出しを追随させる */
  onTitle?: (t: string) => void
}) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(600)

  // 契約の土台。中継構成では https://app.hrns.jp/t/{契約}
  const base = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '')
  const src = `${base}${path}${path.includes('?') ? '&' : '?'}embed=1`

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      // ★ 出どころを確かめる。**どこからでも高さを変えられては困る**
      if (!base.startsWith(e.origin)) return
      const d = e.data as { type?: string; height?: number }
      if (d?.type !== 'lhc:embed-height') return
      const h = Number(d.height)
      if (Number.isFinite(h) && h > 0) setHeight(Math.min(Math.max(h, 200), 20000))
      const t = (e.data as { title?: string }).title
      if (typeof t === 'string' && t) onTitle?.(t)
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [base, onTitle])

  if (!base) {
    return <p className="text-sm text-gray-500">この画面は準備中です。</p>
  }

  return (
    <iframe
      ref={ref}
      src={src}
      title={title}
      className="w-full border-0 block"
      style={{ height }}
      // ★ 同一オリジンなので sandbox は掛けない(掛けるとCookieが届かない)
    />
  )
}
