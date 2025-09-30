# SignatureWall Frontend

## 准备

1. 先部署合约（见 `../contracts`）。
2. 将生成的 `deployments/sepolia/SignatureWall.json` 放在 `../contracts/deployments/sepolia/`。
3. 运行 `npm run genabi` 自动写入 `abi/SignatureWallABI.ts` 与 `abi/SignatureWallAddresses.ts`。

## 开发

```
npm i
npm run dev
```

打开浏览器并连接 MetaMask 至 Sepolia 后：
- “签名并提交”：链上写入签名（内容、昵称）
- “链下签名”：生成 EIP712 结构化链下签名
- “点赞”：通过 relayer-sdk 创建加密输入并上链更新同态点赞
- “解密点赞”：调用 `decryptPublic` 读取点赞明文（演示公开解密）



