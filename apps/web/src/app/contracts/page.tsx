'use client'

import { useState } from 'react'

// 契約の切り替え。中身は control-plane 側の画面をそのまま右側に置く。
// 詳しい理由は components/embed/contract-frame.tsx を参照。

import Header from '@/components/layout/header'
import ContractFrame from '@/components/embed/contract-frame'

export default function Page() {
  // ★ 枠の中で画面が移ったら、上の見出しも追随させる
  const [heading, setHeading] = useState("契約の切り替え")
  return (
    <div>
      <Header title={heading} description="この account で入れる契約の一覧" />
      <ContractFrame onTitle={setHeading} path="/?switch=1" title="契約の切り替え" />
    </div>
  )
}
