'use client'

// AI連携。中身は control-plane 側の画面をそのまま右側に置く。
// 詳しい理由は components/embed/contract-frame.tsx を参照。

import Header from '@/components/layout/header'
import ContractFrame from '@/components/embed/contract-frame'

export default function Page() {
  return (
    <div>
      <Header title="AI連携" description="AIツールからこの契約を操作するための接続" />
      <ContractFrame path="/ai" title="AI連携" />
    </div>
  )
}
