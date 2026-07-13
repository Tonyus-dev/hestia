# Códice API

A API do Códice é uma extensão de leitura (read-only) embutida na Héstia que visa expor a biblioteca do `/KALINE/codice` de forma segura e determinística para o aplicativo Códice, especialmente através do Tailscale.

## Endpoints

Todas as rotas requerem que o request passe pela validação de Host Header da Héstia.

### 1. `GET /api/codice/health`
Retorna o status da biblioteca. 
- **Sucesso (200)**: `{"ok":true,"schemaVersion":1,"generatedAt":"...","libraryAvailable":true,"formats":["epub","pdf","txt"]}`
- **Falha (503)**: Retorna se a biblioteca principal (`codice/epub` ou `codice/pdf`) não estiver montada no sistema de arquivos local.

### 2. `GET /api/codice/library`
Varre e indexa a biblioteca em tempo real.
- **Retorno (200)**: Array de livros com metadata, sem expor paths absolutos ou caminhos de diretório.
- **Formato**:
```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-07-12T00:00:00.000Z",
  "books": [
    {
      "id": "base64url-sha256-hash",
      "name": "Livro.epub",
      "title": "Livro",
      "author": null,
      "format": "epub",
      "size": 123456,
      "modifiedAt": "2026-07-12T00:00:00.000Z",
      "url": "/api/codice/books/base64url-sha256-hash"
    }
  ]
}
```

### 3. `GET /api/codice/books/:bookId`
Lê e transfere o livro (Stream).
- **Validação**: Verifica se o hash de `bookId` confere com o arquivo listado na indexação e resolve o Path usando `realpath` rígido.
- **Resposta**: Mime-Type definido com base na extensão e arquivo anexado no corpo da resposta com `Content-Disposition`.

### 4. `HEAD /api/codice/books/:bookId`
Verifica a presença e o tamanho do livro sem baixá-lo.

## Segurança
- Não expõe árvores de diretórios (ignora sub-pastas vazias e caminhos complexos).
- CORS bloqueado por padrão; habilitado de forma customizada apontando para `HESTIA_CODICE_CORS_ORIGIN`.
- Nega qualquer tentativa de symlink fora dos domínios da pasta canônica `/KALINE/codice`.
