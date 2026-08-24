'use client'

// 契約の切り替え。中身は control-plane 側の画面をそのまま右側に置く。
// 詳しい理由は components/embed/contract-frame.tsx を参照。

import ContractFrame from '@/components/embed/contract-frame'

export default function Page() {
  return (
    <div>
      <ContractFrame path="/?switch=1" title="契約一覧" />
    </div>
  )
}
