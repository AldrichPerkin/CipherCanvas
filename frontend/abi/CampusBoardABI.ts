export const FHE_CAMPUS_BOARD_ABI = [
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "id", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "author", "type": "address" },
      { "indexed": false, "internalType": "string", "name": "nickname", "type": "string" },
      { "indexed": false, "internalType": "string", "name": "text", "type": "string" },
      { "indexed": false, "internalType": "uint64", "name": "createdAt", "type": "uint64" }
    ],
    "name": "NotePosted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "id", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "sender", "type": "address" }
    ],
    "name": "NoteCheered",
    "type": "event"
  },
  {
    "inputs": [
      { "internalType": "string", "name": "text", "type": "string" },
      { "internalType": "string", "name": "nickname", "type": "string" }
    ],
    "name": "postNote",
    "outputs": [ { "internalType": "uint256", "name": "id", "type": "uint256" } ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [ { "internalType": "uint256", "name": "id", "type": "uint256" } ],
    "name": "getCheersHandle",
    "outputs": [ { "internalType": "euint32", "name": "", "type": "bytes32" } ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [ { "internalType": "uint256", "name": "id", "type": "uint256" } ],
    "name": "getCheersPlain",
    "outputs": [ { "internalType": "uint32", "name": "", "type": "uint32" } ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [ { "internalType": "uint256", "name": "id", "type": "uint256" } ],
    "name": "getNote",
    "outputs": [
      { "internalType": "uint256", "name": "noteId", "type": "uint256" },
      { "internalType": "address", "name": "author", "type": "address" },
      { "internalType": "string", "name": "text", "type": "string" },
      { "internalType": "string", "name": "nickname", "type": "string" },
      { "internalType": "uint64", "name": "createdAt", "type": "uint64" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "listNotes",
    "outputs": [
      {
        "components": [
          { "internalType": "uint256", "name": "id", "type": "uint256" },
          { "internalType": "address", "name": "author", "type": "address" },
          { "internalType": "string", "name": "text", "type": "string" },
          { "internalType": "string", "name": "nickname", "type": "string" },
          { "internalType": "uint64", "name": "createdAt", "type": "uint64" },
          { "internalType": "euint32", "name": "cheers", "type": "bytes32" },
          { "internalType": "uint32", "name": "cheersPlain", "type": "uint32" }
        ],
        "internalType": "struct CampusBoard.CampusNote[]",
        "name": "notes",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "id", "type": "uint256" },
      { "internalType": "externalEuint32", "name": "plusOneExt", "type": "bytes32" },
      { "internalType": "bytes", "name": "inputProof", "type": "bytes" }
    ],
    "name": "cheerNote",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "nextId",
    "outputs": [ { "internalType": "uint256", "name": "", "type": "uint256" } ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "protocolId",
    "outputs": [ { "internalType": "uint256", "name": "", "type": "uint256" } ],
    "stateMutability": "pure",
    "type": "function"
  }
];


