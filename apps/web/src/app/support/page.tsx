'use client'

// お問い合わせ。中身は control-plane 側の画面をそのまま右側に置く。
// 詳しい理由は components/embed/contract-frame.tsx を参照。

import Header from '@/components/layout/header'
import ContractFrame from '@/components/embed/contract-frame'

export default function Page() {
  return (
    <div>
      <Header title="お問い合わせ" description="運営への問い合わせと返信の履歴" />
      <ContractFrame path="/support" title="お問い合わせ" />
    </div>
  )
}
