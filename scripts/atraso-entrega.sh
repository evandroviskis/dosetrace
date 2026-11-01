#!/bin/bash
# Quantas correções estão paradas sem chegar a ninguém (founder 2026-11-01: "se vai deixando os erros
# encontrados para arrumar depois… as atualizações acabam não saindo"). Lido no início de cada sessão.
# Atualizar LOJA_* a cada envio às lojas e TESTE ao publicar um EAS Update a partir de outro branch.
LOJA_COMMIT=c249164; LOJA_VERSAO=1.3.0; LOJA_DESDE=2026-10-23
TESTE=update/131-4; APP=redesign/graduated
cd "$(dirname "$0")/.." || exit 0
dias=$(( ( $(date +%s) - $(date -j -f %Y-%m-%d "$LOJA_DESDE" +%s 2>/dev/null || echo 0) ) / 86400 ))
fix='DV-[0-9]+|A-[0-9]+|AD-[0-9]+|fix'
loja=$(git log --oneline "$LOJA_COMMIT..$APP" 2>/dev/null | grep -cE "$fix")
teste=$(git cherry "$TESTE" "$APP" 2>/dev/null | grep '^+' | cut -c3- | xargs -n1 git log -1 --format=%s 2>/dev/null | grep -cE "$fix")
echo "ENTREGA: as lojas estão na $LOJA_VERSAO há $dias dias. $loja commits de correção/item no $APP ainda não chegaram a nenhum usuário das lojas; $teste nem aos testadores (fora do $TESTE)."
echo "Regra: correção de versão publicada sai já (EAS Update para JS, build para nativo). Número alto = propor o envio nesta sessão."
