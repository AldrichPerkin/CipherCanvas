"use client";

import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { clsx } from "clsx";
import { FHE_CAMPUS_BOARD_ABI } from "@/abi/CampusBoardABI";
import { CampusBoardAddresses } from "@/abi/CampusBoardAddresses";

type Note = {
  id: bigint;
  author: string;
  text: string;
  nickname: string;
  createdAt: bigint;
  cheersPlain?: number;
};

type StatusType = "idle" | "loading-sdk" | "ready" | "error";

export default function Page() {
  const [provider, setProvider] = useState<ethers.BrowserProvider | undefined>(undefined);
  const [signer, setSigner] = useState<ethers.Signer | undefined>(undefined);
  const [account, setAccount] = useState<string | undefined>(undefined);
  const [chainId, setChainId] = useState<number | undefined>(undefined);
  const [status, setStatus] = useState<StatusType>("idle");

  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState("");
  const [nickname, setNickname] = useState("");
  const [message, setMessage] = useState("");
  const [offchainSig, setOffchainSig] = useState("");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheering, setIsCheering] = useState<Set<string>>(new Set());
  const [showSig, setShowSig] = useState(false);

  const [fhevm, setFhevm] = useState<any | undefined>(undefined);

  // 确保本账户已初始化FHE密钥（某些SDK需要先生成/登记一次密钥）
  const ensureFHEKeypair = async () => {
    try {
      if (!fhevm || !account || !contractAddress) return;
      const buf = fhevm.createEncryptedInput(contractAddress, account);
      buf.add32(BigInt(0));
      await buf.encrypt();
    } catch {}
  };

  const contractAddress = useMemo(() => {
    const key = String(chainId ?? "");
    const entry = CampusBoardAddresses["11155111"] || CampusBoardAddresses[key];
    return entry?.address;
  }, [chainId]);

  const contract = useMemo(() => {
    if (!contractAddress || !signer) return undefined;
    return new ethers.Contract(contractAddress, FHE_CAMPUS_BOARD_ABI, signer);
  }, [contractAddress, signer]);

  useEffect(() => {
    const setup = async () => {
      if (!(window as any).ethereum) return;
      const prov = new ethers.BrowserProvider((window as any).ethereum);
      setProvider(prov);
      const net = await prov.getNetwork();
      setChainId(Number(net.chainId));
      const s = await prov.getSigner().catch(() => undefined);
      if (s) {
        setSigner(s);
        setAccount(await s.getAddress());
      }
      (window as any).ethereum?.on?.("chainChanged", () => window.location.reload());
      (window as any).ethereum?.on?.("accountsChanged", () => window.location.reload());
    };
    setup();
    // init favorites from localStorage
    try {
      const raw = localStorage.getItem("campusboard:favorites");
      if (raw) {
        setFavorites(new Set(JSON.parse(raw)));
      }
    } catch {}
  }, []);

  useEffect(() => {
    const boot = async () => {
      try {
        setStatus("loading-sdk");
        let sdk: any;
        try {
          const mod: any = await import("@zama-fhe/relayer-sdk/bundle");
          sdk = (mod && (mod.initSDK || mod.createInstance)) ? mod : mod?.default;
        } catch {
          sdk = undefined;
        }

        // Fallback to UMD CDN if ESM import is unavailable
        if (!sdk || !sdk.initSDK || !sdk.createInstance) {
          if (typeof window === "undefined") throw new Error("window not available for UMD load");
          if (!(window as any).relayerSDK) {
            await new Promise<void>((resolve, reject) => {
              const script = document.createElement("script");
              script.src = "https://cdn.zama.ai/relayer-sdk-js/0.2.0/relayer-sdk-js.umd.cjs";
              script.type = "text/javascript";
              script.async = true;
              script.onload = () => resolve();
              script.onerror = () => reject(new Error("Failed to load Relayer SDK UMD"));
              document.head.appendChild(script);
            });
          }
          sdk = (window as any).relayerSDK;
        }

        if (!sdk || !sdk.initSDK || !sdk.createInstance || !sdk.SepoliaConfig) {
          throw new Error("Relayer SDK not available after fallback");
        }

        await sdk.initSDK();
        const rpcUrl = process.env.NEXT_PUBLIC_SEPOLIA_RPC || "https://ethereum-sepolia-rpc.publicnode.com";
        const instance = await sdk.createInstance({ ...sdk.SepoliaConfig, rpcUrl, network: (window as any).ethereum });
        setFhevm(instance);
        setStatus("ready");
      } catch (e: any) {
        setStatus("error");
        setMessage(String(e?.message || e));
      }
    };
    if (typeof window !== "undefined") {
      boot();
    }
  }, []);

  const connect = async () => {
    if (!(window as any).ethereum) return;
    await (window as any).ethereum.request({ method: "eth_requestAccounts" });
    const prov = new ethers.BrowserProvider((window as any).ethereum);
    const s = await prov.getSigner();
    setSigner(s);
    setAccount(await s.getAddress());
    const net = await prov.getNetwork();
    setChainId(Number(net.chainId));
  };

  const refresh = async () => {
    if (!contractAddress || !provider) return;
    try {
      console.log("Refreshing data from contract:", contractAddress);
      const readonly = new ethers.Contract(contractAddress, FHE_CAMPUS_BOARD_ABI, provider);
      const list = await readonly.listNotes();
      console.log("Raw contract data:", list);
      
      const arr: Note[] = list.map((x: any) => ({
        id: x.id,
        author: x.author,
        text: x.text,
        nickname: x.nickname,
        createdAt: x.createdAt,
        cheersPlain: x.cheersPlain ? Number(x.cheersPlain) : 0,
      }));
      
      console.log("Processed items:", arr);
      arr.sort((a, b) => Number(b.createdAt - a.createdAt));
      setNotes(arr);
    } catch (error) {
      console.error("Failed to refresh data:", error);
      setMessage(`读取数据失败: ${error}`);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractAddress]);

  const submitOnChain = async () => {
    if (!contract || !text) {
      console.log("Missing dependencies for submit:", { contract: !!contract, text: !!text });
      setMessage("请填写留言内容");
      return;
    }
    
    setIsSubmitting(true);
    setMessage("正在提交到区块链...");
    
    try {
      console.log("Submitting note:", { text, nickname, contractAddress });
      console.log("Contract instance:", contract);
      
      const tx = await contract.postNote(text, nickname || "");
      console.log("Transaction sent:", tx);
      
      setMessage("等待交易确认...");
      const receipt = await tx.wait();
      console.log("Transaction confirmed:", receipt);
      
      setMessage("留言已成功上链！");
      setText("");
      setNickname("");
      
      // 延迟刷新确保数据更新
      setTimeout(() => refresh(), 2000);
    } catch (e: any) {
      console.error("Submit failed:", e);
      setMessage(`提交失败: ${e?.message || e}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const cheer = async (id: bigint) => {
    if (!contract || !fhevm || !account) {
      console.log("Missing dependencies:", { contract: !!contract, fhevm: !!fhevm, account: !!account });
      setMessage("请确保钱包已连接且FHEVM已就绪");
      return;
    }
    if (chainId !== 11155111) {
      setMessage("请切换到 Sepolia 网络后再试");
      return;
    }
    
    const idStr = String(id);
    setIsCheering(prev => new Set([...prev, idStr]));
    setMessage("正在加密喝彩数据...");
    
    try {
      console.log("Creating encrypted input for like...");
      const buffer = fhevm.createEncryptedInput(contract.target as string, account);
      buffer.add32(BigInt(1));
      
      console.log("Encrypting input...");
      const encryptWithRetry = async (max = 3): Promise<any> => {
        let lastErr: any;
        for (let i = 0; i < max; i++) {
          try {
            return await buffer.encrypt();
          } catch (e) {
            lastErr = e;
            console.warn(`encrypt attempt ${i + 1} failed`, e);
            await new Promise(r => setTimeout(r, 700 * (i + 1)));
          }
        }
        throw lastErr;
      };
      const enc = await encryptWithRetry(3);
      
      setMessage("发送喝彩交易...");
      console.log("Calling cheerNote with:", { id, handle: enc.handles[0] });
      const tx = await contract.cheerNote(id, enc.handles[0], enc.inputProof);
      
      setMessage("等待交易确认...");
      const receipt = await tx.wait();
      console.log("Transaction confirmed:", receipt);
      
      setMessage("喝彩成功！");
      setTimeout(() => refresh(), 1000); // 延迟刷新确保数据更新
    } catch (e: any) {
      console.error("Cheer failed:", e);
      const detail = typeof e?.message === 'string' ? e.message : String(e);
      setMessage(`喝彩失败: ${detail.includes('REQUEST FAILED RESPONSE') ? 'Relayer暂时不可用或网络异常，请稍后重试' : detail}`);
    } finally {
      setIsCheering(prev => {
        const next = new Set(prev);
        next.delete(idStr);
        return next;
      });
    }
  };

  const signOffChain = async () => {
    if (!signer || !text) return;
    const domain = { name: "CampusBoard", version: "1", chainId, verifyingContract: contractAddress };
    const types = { Post: [{ name: "text", type: "string" }, { name: "nickname", type: "string" }] } as const;
    const value = { text, nickname } as const;
    // @ts-ignore
    const sig = await (signer as any)._signTypedData(domain, types, value);
    setMessage(`链下签名生成成功`);
    setOffchainSig(sig);
  };

  const verifyOffChain = async () => {
    try {
      if (!offchainSig || !text) return;
      const domain = { name: "CampusBoard", version: "1", chainId, verifyingContract: contractAddress };
      const types = { Post: [{ name: "text", type: "string" }, { name: "nickname", type: "string" }] } as const;
      const value = { text, nickname } as const;
      const recovered = ethers.verifyTypedData(domain as any, types as any, value as any, offchainSig);
      setMessage(`✅ 签名验证成功！签名者: ${recovered.slice(0, 6)}...${recovered.slice(-4)}`);
    } catch (e: any) {
      setMessage(`❌ 签名验证失败: ${String(e?.message || e)}`);
    }
  };

  const decryptCheers = async (id: bigint, author?: string) => {
    if (!fhevm || !provider) {
      setMessage("FHEVM实例或provider未就绪");
      return;
    }
    if (author && account && author.toLowerCase() !== account.toLowerCase()) {
      const readonly = new ethers.Contract(contractAddress as string, FHE_CAMPUS_BOARD_ABI, provider);
      const handle = await readonly.getCheersHandle(id);
      setMessage(`仅作者可解密。句柄: ${String(handle).slice(0, 10)}...${String(handle).slice(-6)}`);
      return;
    }
    
    try {
      console.log("Decrypting cheers for ID:", id);
      const readonly = new ethers.Contract(contractAddress as string, FHE_CAMPUS_BOARD_ABI, provider);
      const handle = await readonly.getCheersHandle(id);
      console.log("Got cheers handle:", handle);

      // 优先尝试公共解密，其次尝试用户授权解密，最后普通解密
      const tryDecryptPublic = async () => {
        const fn: any = (fhevm as any).decryptPublic;
        if (typeof fn === 'function') {
          return await fn(contractAddress, handle);
        }
        return undefined;
      };

      const tryUserDecrypt = async () => {
        const fn: any = (fhevm as any).userDecrypt;
        if (typeof fn === 'function') {
          setMessage("请在钱包中确认签名以授权解密...");
          return await fn(contractAddress, handle);
        }
        return undefined;
      };

      const tryDecrypt = async () => {
        const fn: any = (fhevm as any).decrypt;
        if (typeof fn === 'function') {
          return await fn(contractAddress, handle);
        }
        return undefined;
      };

      let clear: any;
      try {
        clear = await tryDecryptPublic();
      } catch (e) {
        console.warn('decryptPublic failed', e);
      }
      if (clear === undefined || clear === null) {
        try {
          clear = await tryUserDecrypt();
        } catch (e) {
          console.warn('userDecrypt failed', e);
          const msg = String((e as any)?.message || e || '');
          if (msg.includes('Invalid public or private key')) {
            await ensureFHEKeypair();
            try { clear = await tryUserDecrypt(); } catch (e2) { console.warn('userDecrypt retry failed', e2); }
          }
        }
      }
      if (clear === undefined || clear === null) {
        try {
          clear = await tryDecrypt();
        } catch (e) {
          console.warn('decrypt failed', e);
        }
      }

      // 尝试 32 位变体方法（某些 SDK 以位宽后缀提供）
      if (clear === undefined || clear === null) {
        const candidates = [
          'decryptPublic32',
          'userDecrypt32',
          'decrypt32',
        ];
        for (const name of candidates) {
          const fn: any = (fhevm as any)[name];
          if (typeof fn === 'function') {
            try {
              if (name.includes('userDecrypt')) setMessage('请在钱包中确认签名以授权解密...');
              clear = await fn(contractAddress, handle);
              break;
            } catch (e) {
              console.warn(`${name} failed`, e);
            }
          }
        }
      }

      if (clear === undefined || clear === null) {
        setMessage(`🔓 ID ${id} 的加密句柄: ${String(handle).slice(0, 10)}...${String(handle).slice(-6)}（当前SDK不支持直接解密）`);
        return;
      }

      setMessage(`🔓 ID ${id} 的喝彩数: ${clear?.toString?.() ?? String(clear)}`);
    } catch (error: any) {
      console.error("Decryption failed:", error);
      setMessage(`解密失败: ${error?.message || error}`);
    }
  };

  // 强制走用户解密（便于调试“未弹签名”的情况）
  const decryptCheersUser = async (id: bigint) => {
    if (!fhevm || !provider) {
      setMessage("FHEVM实例或provider未就绪");
      return;
    }
    try {
      const readonly = new ethers.Contract(contractAddress as string, FHE_CAMPUS_BOARD_ABI, provider);
      const handle = await readonly.getCheersHandle(id);
      const userFns = ['userDecrypt', 'userDecrypt32'];
      let clear: any;
      for (const name of userFns) {
        const fn: any = (fhevm as any)[name];
        if (typeof fn === 'function') {
          setMessage('请在钱包中确认签名以授权解密...');
          try {
            clear = await fn(contractAddress, handle);
            break;
          } catch (e) {
            console.warn(`${name} failed`, e);
          }
        }
      }
      if (clear === undefined || clear === null) {
        setMessage(`未找到用户解密方法，句柄: ${String(handle).slice(0, 10)}...${String(handle).slice(-6)}`);
        return;
      }
      setMessage(`🔓 ID ${id} 的喝彩数: ${clear?.toString?.() ?? String(clear)}`);
    } catch (error: any) {
      setMessage(`用户解密失败: ${error?.message || error}`);
    }
  };

  const toggleFavorite = (id: bigint) => {
    const key = String(id);
    const next = new Set(favorites);
    if (next.has(key)) next.delete(key); else next.add(key);
    setFavorites(next);
    try { localStorage.setItem("campusboard:favorites", JSON.stringify(Array.from(next))); } catch {}
  };

  const copySignature = () => {
    navigator.clipboard.writeText(offchainSig);
    setMessage("签名已复制到剪贴板");
  };

  const statusColors = {
    idle: "text-gray-500 bg-gray-100",
    "loading-sdk": "text-blue-500 bg-blue-100",
    ready: "text-green-500 bg-green-100",
    error: "text-red-500 bg-red-100",
  };

  const statusText = {
    idle: "初始化中...",
    "loading-sdk": "加载 FHEVM SDK...",
    ready: "已就绪",
    error: "错误",
  };

  return (
    <div className="min-h-screen backdrop-blur-sm bg-white/60">
      <style jsx global>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-float { animation: float 3s ease-in-out infinite; }
        .animate-pulse-slow { animation: pulse 2s infinite; }
        .gradient-bg {
          background: linear-gradient(-45deg, #ee7752, #e73c7e, #23a6d5, #23d5ab);
          background-size: 400% 400%;
          animation: gradient 15s ease infinite;
        }
        .glass-effect {
          backdrop-filter: blur(10px);
          background: rgba(255, 255, 255, 0.25);
          border: 1px solid rgba(255, 255, 255, 0.18);
        }
        .card-hover {
          transition: all 0.3s ease;
        }
        .card-hover:hover {
          transform: translateY(-5px);
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
        }
      `}</style>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        {/* 头部 - 校园主题 */}
        <header className="text-center mb-12">
          <div className="inline-flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-white/70 flex items-center justify-center shadow-lg ring-2 ring-emerald-400 animate-float">
              <span className="text-2xl">🎓</span>
            </div>
            <h1 className="text-5xl font-extrabold text-emerald-700 drop-shadow">校园留言板</h1>
          </div>
          <p className="text-lg text-emerald-900/80 mb-8">FHEVM 加密喝彩 · 校园社区的链上纪念册</p>
          
          <div className="flex items-center justify-center gap-6 mb-8">
            <div className={clsx("inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium", statusColors[status])}>
              <div className={clsx("w-2 h-2 rounded-full", status === "loading-sdk" ? "animate-pulse-slow bg-current" : "bg-current")}></div>
              {statusText[status]}
            </div>
            
            {!account ? (
              <button
                onClick={connect}
                className="px-8 py-3 bg-emerald-600 text-white rounded-full font-semibold shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
              >
                🔗 连接钱包
              </button>
            ) : (
              <div className="flex items-center gap-4">
                <div className="px-4 py-2 rounded-full bg-white/80 shadow">
                  <div className="flex items-center gap-2 text-sm text-emerald-900">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse-slow"></div>
                    👤 {account.slice(0, 6)}...{account.slice(-4)}
                  </div>
                </div>
                <div className="text-xs text-emerald-900/70">链ID: {chainId} {chainId === 11155111 ? "(Sepolia ✅)" : "(请切换到Sepolia ❌)"} | 合约: {contractAddress ? "✅" : "❌"}</div>
              </div>
            )}
          </div>
        </header>

        {/* 留言提交区域 */}
        <section className="mb-12">
          <div className="rounded-3xl p-8 shadow-2xl max-w-2xl mx-auto bg-white/80 backdrop-blur-sm ring-1 ring-emerald-100">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              📝 写下你的校园留言
            </h2>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-emerald-900 mb-2">留言内容</label>
                <textarea
                  className="w-full px-4 py-3 border border-emerald-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 resize-none"
                  rows={4}
                  placeholder="写下你的校园瞬间..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={200}
                />
                <div className="text-right text-xs text-gray-500 mt-1">
                  {text.length}/200
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-emerald-900 mb-2">昵称（可选）</label>
                <input
                  type="text"
                  className="w-full px-4 py-3 border border-emerald-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
                  placeholder="你的昵称"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={64}
                />
              </div>
              
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => {
                    console.log("Submit button clicked!");
                    console.log("Current state:", { text, nickname, contract: !!contract, isSubmitting });
                    submitOnChain();
                  }}
                  disabled={!text || isSubmitting}
                  className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-2xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105"
                >
                  {isSubmitting ? "⏳" : "🚀"} {isSubmitting ? "提交中..." : "发布留言"}
                </button>
                
                <button
                  onClick={signOffChain}
                  disabled={!text}
                  className="flex items-center gap-2 px-6 py-3 bg-emerald-900 text-white rounded-2xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105"
                >
                  🛡️ 链下签名
                </button>
                
                {offchainSig && (
                  <button
                    onClick={verifyOffChain}
                    className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-2xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
                  >
                    ✅ 验证签名
                  </button>
                )}
              </div>
              
              {offchainSig && (
                <div className="mt-4 p-4 bg-gray-50 rounded-2xl">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">链下签名</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowSig(!showSig)}
                        className="text-gray-500 hover:text-gray-700 text-sm"
                      >
                        {showSig ? "🙈 隐藏" : "👁️ 显示"}
                      </button>
                      <button
                        onClick={copySignature}
                        className="text-gray-500 hover:text-gray-700 text-sm"
                      >
                        📋 复制
                      </button>
                    </div>
                  </div>
                  <div className="font-mono text-xs break-all text-gray-600 bg-white p-3 rounded-lg">
                    {showSig ? offchainSig : "•".repeat(60)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 状态消息 */}
        {message && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-2xl text-blue-800 max-w-2xl mx-auto">
            {message}
          </div>
        )}

        {/* 校园留言列表 */}
        <section>
          <div className="flex items-center justify-center gap-4 mb-8">
            <h2 className="text-3xl font-bold">
              <span className="text-emerald-800">
                🎒 校园留言墙
              </span>
            </h2>
            <button
              onClick={refresh}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              🔄 刷新
            </button>
          </div>
          
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {notes.map((item) => (
              <div
                key={String(item.id)}
                className="rounded-3xl p-6 shadow-xl card-hover bg-white/80 backdrop-blur-sm ring-1 ring-emerald-100"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-500/80 rounded-full flex items-center justify-center text-white">
                      <span className="font-bold">
                        {(item.nickname || item.author).charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className="font-semibold text-emerald-900">
                        {item.nickname || `${item.author.slice(0, 6)}...${item.author.slice(-4)}`}
                      </div>
                      <div className="text-xs text-emerald-900/70">
                        🕒 {new Date(Number(item.createdAt) * 1000).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  
                  {favorites.has(String(item.id)) && (
                    <span className="text-yellow-500 text-lg">⭐</span>
                  )}
                </div>
                
                <div className="mb-4 p-4 bg-emerald-50 rounded-2xl">
                  <p className="text-emerald-900 whitespace-pre-wrap break-words leading-relaxed">
                    {item.text}
                  </p>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <button
                      onClick={() => cheer(item.id)}
                      disabled={isCheering.has(String(item.id))}
                      className="flex items-center gap-1 px-3 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 hover:scale-105"
                    >
                      {isCheering.has(String(item.id)) ? "⏳" : "🎉"} 喝彩 {item.cheersPlain ? `(${item.cheersPlain})` : ""}
                    </button>
                    
                    <button
                      onClick={() => decryptCheers(item.id, item.author)}
                      className="flex items-center gap-1 px-3 py-2 bg-emerald-500 text-white rounded-xl text-sm font-medium shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105"
                    >
                      🔓 解密FHE
                    </button>
                    <button
                      onClick={() => decryptCheersUser(item.id)}
                      className="flex items-center gap-1 px-3 py-2 bg-amber-500 text-white rounded-xl text-sm font-medium shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105"
                    >
                      🔐 用户解密
                    </button>
                  </div>
                  
                  <button
                    onClick={() => toggleFavorite(item.id)}
                    className={clsx(
                      "p-2 rounded-xl transition-all duration-200 hover:scale-110",
                      favorites.has(String(item.id))
                        ? "bg-yellow-400 text-white shadow-md"
                        : "bg-white/70 text-emerald-900 hover:bg-white"
                    )}
                  >
                    {favorites.has(String(item.id)) ? "⭐" : "☆"}
                  </button>
                </div>
              </div>
            ))}
          </div>
          
          {notes.length === 0 && (
            <div className="text-center py-12">
              <div className="text-6xl mb-4 animate-float">🎓</div>
              <p className="text-xl text-emerald-900/70">还没有内容，成为第一个留下校园记忆的人吧！</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}