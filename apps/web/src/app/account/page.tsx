'use client'

import { useState } from 'react'

// アカウント。中身は control-plane 側の画面をそのまま右側に置く。
// 詳しい理由は components/embed/contract-frame.tsx を参照。

import Header from '@/components/layout/header'
import ContractFrame from '@/components/embed/contract-frame'

export default function Page() {
  // ★ 枠の中で画面が移ったら、上の見出しも追随させる
  const [heading, setHeading] = useState("アカウント")
  return (
    <div>
      <Header title={heading} description="ログインに使うメールアドレスとパスワード" />
      <ContractFrame onTitle={setHeading} path="/account" title="アカウント" />
    </div>
  )
}
