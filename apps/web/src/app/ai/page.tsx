'use client'

import { useState } from 'react'

// AI連携。中身は control-plane 側の画面をそのまま右側に置く。
// 詳しい理由は components/embed/contract-frame.tsx を参照。

import Header from '@/components/layout/header'
import ContractFrame from '@/components/embed/contract-frame'

export default function Page() {
  // ★ 枠の中で画面が移ったら、上の見出しも追随させる
  const [heading, setHeading] = useState("AI連携")
  return (
    <div>
      <Header title={heading} description="AIツールからこの契約を操作するための接続" />
      <ContractFrame onTitle={setHeading} path="/ai" title="AI連携" />
    </div>
  )
}
