'use client'

// 請求とお支払い。中身は control-plane 側の画面をそのまま右側に置く。
// 詳しい理由は components/embed/contract-frame.tsx を参照。

import Header from '@/components/layout/header'
import ContractFrame from '@/components/embed/contract-frame'

export default function Page() {
  return (
    <div>
      <Header title="請求とお支払い" description="領収書・お支払い方法・プランの変更" />
      <ContractFrame path="/billing" title="請求とお支払い" />
    </div>
  )
}
