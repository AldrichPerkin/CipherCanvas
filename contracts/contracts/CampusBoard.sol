// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint32, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title CampusBoard - 校园主题留言板（FHE 加密“喝彩”计数）
/// @notice 公开存储留言（明文），加密存储喝彩数并支持同态自增
contract CampusBoard is SepoliaConfig {
    struct CampusNote {
        uint256 id;              // 明文自增 ID
        address author;          // 作者地址
        string text;             // 留言内容（明文）
        string nickname;         // 昵称（明文）
        uint64 createdAt;        // 时间戳（明文）
        euint32 cheers;          // 加密喝彩计数
        uint32 cheersPlain;      // 明文镜像（UI 辅助，不可信）
    }

    event NotePosted(uint256 indexed id, address indexed author, string nickname, string text, uint64 createdAt);
    event NoteCheered(uint256 indexed id, address indexed sender);

    uint256 public nextId = 1;
    mapping(uint256 => CampusNote) private _notes;

    /// @notice 发表一条校园留言
    function postNote(string memory text, string memory nickname) external returns (uint256 id) {
        require(bytes(text).length > 0 && bytes(text).length <= 200, "invalid text length");
        require(bytes(nickname).length <= 64, "invalid nickname length");

        id = nextId++;

        euint32 zero = FHE.asEuint32(0);
        _notes[id] = CampusNote({
            id: id,
            author: msg.sender,
            text: text,
            nickname: nickname,
            createdAt: uint64(block.timestamp),
            cheers: zero,
            cheersPlain: 0
        });

        FHE.allowThis(_notes[id].cheers);
        FHE.allow(_notes[id].cheers, msg.sender);

        emit NotePosted(id, msg.sender, nickname, text, uint64(block.timestamp));
    }

    /// @notice 为指定留言喝彩（+1），外部传入加密的 +1 与证明
    function cheerNote(uint256 id, externalEuint32 plusOneExt, bytes calldata inputProof) external {
        require(id > 0 && id < nextId, "invalid id");
        CampusNote storage note = _notes[id];
        require(note.author != address(0), "not found");

        euint32 plusOne = FHE.fromExternal(plusOneExt, inputProof);
        note.cheers = FHE.add(note.cheers, plusOne);

        // 维持 ACL
        FHE.allowThis(note.cheers);
        FHE.allow(note.cheers, note.author);
        FHE.allowTransient(note.cheers, msg.sender);

        unchecked { note.cheersPlain += 1; }

        emit NoteCheered(id, msg.sender);
    }

    /// @notice 获取单条留言（不含加密计数）
    function getNote(uint256 id)
        external
        view
        returns (
            uint256 noteId,
            address author,
            string memory text,
            string memory nickname,
            uint64 createdAt
        )
    {
        require(id > 0 && id < nextId, "invalid id");
        CampusNote storage note = _notes[id];
        require(note.author != address(0), "not found");
        return (note.id, note.author, note.text, note.nickname, note.createdAt);
    }

    /// @notice 获取所有留言（为前端渲染准备）
    function listNotes() external view returns (CampusNote[] memory notes) {
        uint256 n = nextId - 1;
        notes = new CampusNote[](n);
        for (uint256 i = 1; i <= n; i++) {
            notes[i-1] = _notes[i];
        }
    }

    /// @notice 读取某条留言的加密喝彩计数句柄
    function getCheersHandle(uint256 id) external view returns (euint32) {
        require(id > 0 && id < nextId, "invalid id");
        CampusNote storage note = _notes[id];
        require(note.author != address(0), "not found");
        return note.cheers;
    }

    /// @notice 读取某条留言的明文喝彩神镜
    function getCheersPlain(uint256 id) external view returns (uint32) {
        require(id > 0 && id < nextId, "invalid id");
        CampusNote storage note = _notes[id];
        require(note.author != address(0), "not found");
        return note.cheersPlain;
    }
}


