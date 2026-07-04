// Chama Local — modelo canônico do armazenamento /KALINE.
// Constante estática, mesma lógica que chama/manifest.js: não lê nem escreve disco.
// `logs`/`snapshots` aqui são pastas do usuário dentro de /KALINE — não confundir com os
// arquivos internos da própria Chama Local (identity.json, events/, snapshots/) que vivem em
// config.dataDir (~/.chama/data ou STATE_DIRECTORY), nunca dentro de /KALINE.

const ROOT = "/KALINE";

function folder({
  id,
  label,
  relativePath,
  category,
  purpose,
  required = false,
  serviceHints = [],
}) {
  return {
    id,
    label,
    relativePath,
    absolutePath: `${ROOT}/${relativePath}`,
    category,
    purpose,
    required,
    serviceHints,
  };
}

const FOLDERS = [
  folder({
    id: "entrada",
    label: "Entrada",
    relativePath: "entrada",
    category: "entrada",
    purpose: "Arquivos recebidos de outros aparelhos via Syncthing, aguardando organização.",
    required: true,
    serviceHints: ["syncthing"],
  }),
  folder({
    id: "codice-pdf",
    label: "PDF",
    relativePath: "codice/pdf",
    category: "codice",
    purpose: "Documentos e livros em PDF.",
  }),
  folder({
    id: "codice-epub",
    label: "EPUB",
    relativePath: "codice/epub",
    category: "codice",
    purpose: "Livros em formato EPUB.",
  }),
  folder({
    id: "codice-fichamentos",
    label: "Fichamentos",
    relativePath: "codice/fichamentos",
    category: "codice",
    purpose: "Notas e fichamentos em texto/markdown.",
  }),
  folder({
    id: "midia-videos",
    label: "Vídeos",
    relativePath: "midia/videos",
    category: "midia",
    purpose: "Vídeos locais servidos por Jellyfin e acessíveis via Samba.",
    required: true,
    serviceHints: ["jellyfin", "samba"],
  }),
  folder({
    id: "midia-audio",
    label: "Áudio",
    relativePath: "midia/audio",
    category: "midia",
    purpose: "Áudio local servido por Jellyfin e acessível via Samba.",
    serviceHints: ["jellyfin", "samba"],
  }),
  folder({
    id: "midia-imagens",
    label: "Imagens",
    relativePath: "midia/imagens",
    category: "midia",
    purpose: "Imagens e fotos locais.",
    serviceHints: ["jellyfin", "samba"],
  }),
  folder({
    id: "arquivos",
    label: "Arquivos",
    relativePath: "arquivos",
    category: "arquivos",
    purpose: "Documentos diversos sem categoria de mídia/códice.",
    serviceHints: ["samba"],
  }),
  folder({
    id: "arquivos-compactados",
    label: "Compactados",
    relativePath: "arquivos/compactados",
    category: "arquivos",
    purpose: "Arquivos compactados (zip/rar/7z).",
    serviceHints: ["samba"],
  }),
  folder({
    id: "backups",
    label: "Backups",
    relativePath: "backups",
    category: "backups",
    purpose: "Backups locais do usuário (fora do dataDir interno da Chama Local).",
    required: true,
  }),
  folder({
    id: "modelos",
    label: "Modelos",
    relativePath: "modelos",
    category: "modelos",
    purpose: "Modelos e templates locais do usuário.",
  }),
  folder({
    id: "logs",
    label: "Logs",
    relativePath: "logs",
    category: "logs",
    purpose: "Logs locais do usuário (fora do dataDir interno da Chama Local).",
    required: true,
  }),
  folder({
    id: "snapshots",
    label: "Snapshots",
    relativePath: "snapshots",
    category: "snapshots",
    purpose: "Snapshots locais do usuário (fora do dataDir interno da Chama Local).",
    required: true,
  }),
];

export function getStorageModel() {
  return { root: ROOT, folders: FOLDERS };
}
