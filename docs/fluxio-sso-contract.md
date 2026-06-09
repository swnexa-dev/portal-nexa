# Contrato inicial de SSO para sistemas Nexa

## Objetivo

Todo sistema filho deve confiar no login central da Nexa e bloquear acesso direto quando nao houver JWT valido.

## Como o portal envia acesso

- O portal chama `POST /api/systems/:systemSlug/launch`.
- A API da Nexa valida trial ou assinatura.
- A API devolve `launchUrl` com `?token=JWT`.
- O sistema filho deve ler esse token na entrada e criar a sessao local automaticamente.

## Claims esperadas no token

```json
{
  "sub": "user-id",
  "email": "cliente@email.com",
  "role": "customer",
  "type": "system-access",
  "systemSlug": "fluxio"
}
```

## Regra de protecao nas rotas do sistema filho

1. Procurar token valido em cookie, storage ou query string.
2. Validar com o mesmo `JWT_SECRET` usado pela Nexa.
3. Confirmar `type === "system-access"`.
4. Confirmar `systemSlug` igual ao sistema atual.
5. Se qualquer validacao falhar, redirecionar para a tela principal da Nexa.

## Redirecionamento sugerido

```ts
window.location.href = `${NEXA_PORTAL_URL}?redirect=${encodeURIComponent(window.location.href)}`
```

## Proxima evolucao

- Trocar `query string token` por cookie assinado ou handshake server-to-server.
- Adicionar refresh de sessao entre portal e sistemas.
- Criar endpoint interno para sincronizar dados do usuario entre os produtos.
