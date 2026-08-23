'use client'

import { useState } from 'react'

// 請求とお支払い。中身は control-plane 側の画面をそのまま右側に置く。
// 詳しい理由は components/embed/contract-frame.tsx を参照。

import Header from '@/components/layout/header'
import ContractFrame from '@/components/embed/contract-frame'

export default function Page() {
  // ★ 枠の中で画面が移ったら、上の見出しも追随させる
  const [heading, setHeading] = useState("請求とお支払い")
  return (
    <div>
      <Header title={heading} description="領収書・お支払い方法・プランの変更" />
      <ContractFrame onTitle={setHeading} path="/billing" title="請求とお支払い" />
    </div>
  )
}
