'use client'

// 契約の切り替え。中身は control-plane 側の画面をそのまま右側に置く。
// 詳しい理由は components/embed/contract-frame.tsx を参照。

import Header from '@/components/layout/header'
import ContractFrame from '@/components/embed/contract-frame'

export default function Page() {
  return (
    <div>
      <Header title="契約の切り替え" description="この account で入れる契約の一覧" />
      <ContractFrame path="/?switch=1" title="契約の切り替え" />
    </div>
  )
}
