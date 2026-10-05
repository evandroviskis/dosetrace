# Teste nos aparelhos — DoseTrace 1.3.0 (versão de teste)

Lista do conselho (QA, 2026-10-04). Mais importante primeiro. Anote o número do bloco e do passo de tudo que falhar.

## Antes de começar
- Use a conta de teste (evandro1985@gmail.com) nos dois aparelhos. Nunca a sua conta principal.
- Para cadastro, leituras com IA, assistente e apagar conta, crie uma conta nova: **evandro1985+qa1@gmail.com** (o e-mail chega na mesma caixa e ela começa com 0 leituras usadas). Nunca apague a conta principal nem a Test03.
- No iPhone, ainda na 1.2.4 da loja e com a Test03, tire prints de: lista de protocolos, últimas 5 linhas do Histórico de doses, contagem dos frascos, pesagens, exames, vacinas, Seus números reais em andamento (dia X), seus números / calculadora, dias do registro de comida e o nível de atividade em Editar perfil.

## 1. Atualizar sem perder dados (iPhone)
1. Na 1.2.4, ative o modo avião. Registre uma dose e uma comida. Não abra o app de novo.
2. Instale a versão do TestFlight por cima. Não apague o app antes.
3. Abra, ainda em modo avião. Tudo dos prints tem que estar lá, mais a dose e a comida offline. O nível de atividade tem que ser um dos 5 que faça sentido. Você não pode ser desconectado nem voltar para o início.
4. Desligue o modo avião. No Fold, abra o app (ou espere um minuto). A dose offline aparece lá uma vez, não duas.
5. Toque numa leitura de exame. A tela de permissão da IA tem que aparecer de novo (versão nova). Toque em Recusar: nada é enviado, nada quebra.

## 2. Sair da conta (os dois aparelhos)
1. Modo avião, nada pendente, Ajustes > Sair. Tem que terminar e cair na tela de boas-vindas. Não pode girar para sempre nem dizer que saiu e continuar dentro.
2. Entre de novo online. Todos os dados voltam.
3. Modo avião, registre uma dose, depois Sair. Tem que aparecer um aviso de que há mudanças sem backup, com Ficar / Sair mesmo assim. Toque Ficar: continua conectado, a dose continua lá. Fique online, espere, Sair: agora sai limpo.
4. Feche o app à força e reabra. Continua conectado.

## 3. Encerrar / Recomeçar / Apagar para sempre em dois aparelhos (versão de teste 2)
1. iPhone: crie "QA Delete" e registre 2 doses. Abra o Fold e confirme que está lá.
2. iPhone: "Sim, terminei". Vai para Encerrados e o histórico fica no Histórico de doses. Toque Recomeçar: nova rodada a partir de hoje, histórico antigo continua.
3. Fold: modo avião, registre uma dose no QA Delete.
4. iPhone: encerre e Apague para sempre (vários de uma vez pela lixeira também). Some da lista, do histórico e dos lembretes.
5. Fold: desligue o modo avião e abra Hoje. Tem que aparecer UM aviso: 1 registro não pôde ser salvo, com Descartar / Manter por enquanto. Toque Manter, depois Ajustes > Sair: o aviso de bloqueio oferece Descartar. Toque Descartar: só esse registro sai, nada mais muda.
6. No frasco que acaba: "Protocolo terminado" agora só FECHA o aviso. O protocolo continua ativo e os lembretes continuam. Se ele for para Encerrados, é falha.

## 4. Entrar (desconectado, nos dois temas)
1. iPhone: Continuar com a Apple usa a janela nativa da Apple e entra na sua conta.
2. Fold: Continuar com a Apple abre o navegador e volta para o app. Com o MESMO Apple ID tem que entrar na MESMA conta do iPhone. Cancele no meio: volta para o login sem ficar em loop de erro.
3. Google nos dois. Se o Fold mostrar erro do Google, anote o texto exato (provavelmente é a chave de assinatura, não o código).
4. Conta nova com o e-mail +qa1:
   - O e-mail de confirmação chega no seu idioma. O link abre o app e você entra.
   - Abra o link uma vez num computador, depois entre no celular com a senha. Tem que funcionar.
   - A pergunta de 18+ aparece uma vez e aceita um ano de nascimento real.
   - Perfil, depois os 5 níveis de atividade.
5. Esqueci a senha, no mesmo celular: o link abre Redefinir senha. Feche o app à força nessa tela e reabra: ela volta. Salvar: entra com a senha nova.
6. Abra um link de redefinição conectado em outra conta. O app tem que mostrar as duas contas e perguntar antes de trocar.

## 5. Apagar conta (só a conta +qa1, por último)
1. Ajustes > Apagar conta. Confirme. Cai na tela de boas-vindas.
2. Entre de novo com o mesmo e-mail: os dados antigos não podem voltar.
3. Modo avião e tente apagar: tem que dar uma falha clara, não um falso sucesso.

## 6. Notificações (horário de dose 3 minutos à frente; com o app fechado e aberto)
1. Dose oral: toque Marcar como tomada no aviso SEM abrir o app, com o app totalmente fechado. Abra: registrada uma vez só.
2. Injetável: Marcar como tomada abre o app e pergunta o local antes. Cancele: nenhuma dose salva.
3. Em 1 hora / Amanhã: o aviso volta nessa hora. Toque no corpo do aviso: Hoje abre com essa dose em destaque.
4. Frasco acabando (3 restantes) e validade (7 dias antes e no dia): o toque abre Meus protocolos nesse protocolo.
5. Check-in semanal: abre Progresso em "Registrar o peso de hoje".
6. Seus números reais do dia 21: abre Seus números reais.
7. Comida às 20h: "Registrar" abre o chat com a pergunta da noite. "Nada mais hoje" fecha o dia sem abrir o app.
8. Resumo da manhã (7h): abre Hoje.
9. Desligue cada chave em Ajustes: aquele tipo para.
10. Troque o app para PT: as novas notificações vêm em PT.
11. No Fold, se os lembretes atrasarem: Configurações do Android > Apps > DoseTrace > Alarmes e lembretes.

## 7. Marcar como tomada, Desfazer, avisos de frasco
1. Hoje: Marcar como tomada, depois Desfazer dentro do tempo da barra. A dose some e o frasco volta uma unidade. Tente também dois toques bem rápidos.
2. Marcar como tomada num cartão de Meus protocolos: mesmo resultado. Pulada e depois tomada no Histórico: uma linha, não duas.
3. Frasco com 2 doses: tome as duas. Aparece o aviso de frasco acabado. Crie um frasco novo. A data de início do protocolo e o histórico não mudam.
4. Aviso de estoque baixo em Hoje. O aviso de frasco do primeiro uso aparece uma vez, não de novo depois de reabrir.
5. Nunca dois avisos um em cima do outro.

## 8. Pergunta do histórico
Adicione um protocolo com início 3 semanas atrás.
1. "Mesma dose nas últimas N semanas?" Sim: a curva mostra uma parte tracejada estimada e nenhuma linha Tomada é criada.
2. Faça de novo e responda Não: a curva começa hoje.

## 9. Fold, duas páginas (aberto, na posição normal)
1. Cada aba mostra duas páginas: Hoje com Histórico, Protocolos com detalhe, Jornada com Progresso, Meu Corpo com detalhe do exame, Ajustes. Nada de texto ou botão na dobra.
2. Gire de lado: uma coluna. Fechado: o app normal de celular. Tela dividida com outro app: uma coluna, sem travar.
3. Digite uma nota, feche e abra o Fold: o texto continua e o app não reinicia.
4. O voltar do Android sai da tela, como no celular.
5. Tome uma dose na página esquerda: o Histórico na direita atualiza na hora.
6. TalkBack ligado: ao tocar num item da esquerda, o foco vai para a página direita e o item diz "selecionado". Ordem de leitura: esquerda, depois direita.
7. **Barra de baixo (versão de teste 2):** com a barra de tarefas da Samsung visível, e também com o Fold fechado, as abas ficam inteiras acima da barra do sistema. Abra também uma folha que sobe de baixo (Excluir protocolo, escolher local, Premium) e confira que o último botão não fica atrás da barra.
8. **O mais provável de quebrar:** dose injetável, Marcar como tomada, com a pergunta do local aberta, feche ou abra o Fold. Depois de responder, o Histórico tem que ter exatamente UMA linha.

## 10. Conta grátis (+qa1)
1. Adicione 3 protocolos. O 4º abre a tela do Premium. Com um encerrado, Recomeçar também abre o Premium.
2. Tela do Premium:
   - iPhone: preços reais. O teste grátis só aparece se esse Apple ID nunca teve um. Restaurar compras funciona.
   - Uma compra no TestFlight é de teste, sem cobrança.
   - Modo avião: mensagem honesta de indisponível, nunca em branco nem R$0.
3. Leituras: 1 exame, 1 cartão de vacina, 1 rótulo de frasco. A 4ª é recusada com mensagem clara do limite. É a primeira vez que você aceita a permissão de IA (v4).
4. Assistente de IA no cadastro de protocolo:
   - Só preenche números que você digitou e nunca sugere quantidade de água.
   - Nunca dá conselho.
   - O 11º uso em 7 dias é recusado.
5. Registro de comida: grátis por 7 dias a partir do primeiro uso.

## 11. Temas e idiomas
1. No claro E no escuro, abra cada aviso e seletor dos blocos acima. Tudo legível: local da aplicação, idioma, país, data e hora, Descartar, o aviso "não pôde ser salvo", Premium, botões Apple/Google.
2. Troque o tema com um aviso aberto.
3. PT: passe pelas 5 abas. Digite "0,5" numa dose: lê 0,5. Digite um frasco "5.000 UI": lê cinco mil.
4. DE: mesmo passeio. Nada cortado: botão Pular, nomes das abas, linhas de Ajustes.

## 12. Hora e datas
1. Mude o fuso do celular em 5 horas. Hoje mantém os horários das doses, sem linhas Perdida falsas e sem doses duplicadas.
2. Deixe o app aberto na virada da meia-noite: Hoje muda para o novo dia.
3. Jornada: curva com data 365 dias atrás e 4 ou mais protocolos — não pode travar.

## Versão de teste 2: o que mudou (2026-10-05)

### Bloco 3, passos novos
7. Fold em modo avião: renomeie o QA Delete. iPhone: encerre o protocolo. Fold online, abra Hoje: ele continua Encerrado nos dois aparelhos e não volta a ficar ativo.
8. Apagados recentemente: apague um protocolo hoje e toque Restaurar: ele volta ativo, com lembretes. Um apagado ontem ou antes: Restaurar leva para Encerrados, com o histórico intacto. Toque Restaurar duas vezes rápido: o resultado é o da primeira vez.
9. Conta +qa1 com 3 ativos: apague um, crie outro (3 ativos de novo) e restaure o apagado: ele vai para Encerrados (limite do plano grátis), não para ativos.
10. Protocolo sem dose há 7+ dias, responda "Sim, terminei": em Encerrados, a data de fim é a da ÚLTIMA dose tomada, não hoje. No Histórico somem as "Perdida" depois dessa data; Tomada e Pulada ficam.

### 13. Lembretes (o motivo desta versão)
1. Antes de tudo, no Fold: eu rodo a prova pelo cabo (alarmes do DoseTrace > 0). Durante os testes, não use "Forçar parada" no Fold (isso apaga os alarmes). Para fechar o app, deslize-o para fora dos recentes.
2. Ajustes > Verificar lembretes, no tema claro E no escuro, no iPhone e no Fold. iPhone: Notificações. Fold: Notificações, Dose Reminders, Bateria, Alarmes e lembretes, Apps em suspensão profunda. Cada botão abre a tela certa do sistema; ao voltar, a tela se atualiza.
3. "Enviar um lembrete de teste", feche o app (deslizando): o aviso chega em 10 segundos. Toque nele: abre Verificar lembretes. Nenhuma dose é registrada.
4. Fold: desligue a categoria "Dose Reminders" nas configurações do Android e volte. A linha fica vermelha, Ajustes mostra "Algo está bloqueando seus lembretes" e Hoje mostra "Seus lembretes estão bloqueados" (troque de aba para atualizar). Religue: tudo some. No iPhone, faça o mesmo desligando as notificações do app.
5. Refaça o bloco 6 inteiro no Fold com o app fechado (era o que falhava).
6. Deixe o Fold a noite toda sem abrir o app: os lembretes da manhã chegam. Reinicie o Fold e não abra o app: o próximo lembrete chega mesmo assim.
7. Abra o app e marque uma dose como tomada nos primeiros 10 segundos: o lembrete dessa dose não toca depois.
8. Um protocolo a cada 14 dias (iPhone) ou a cada 28+ dias (Fold), depois da dose de hoje: NÃO pode aparecer "Seus lembretes estão bloqueados".

### 14. Outras mudanças
1. Cartão do protocolo: um semanal com 2 doses seguidas mostra "2 doses sem falhar" (nunca "dias"). Tome uma dose semanal um dia atrasado e anote o número.
2. Pesagem: Fold em modo avião, edite a pesagem de hoje. iPhone: apague essa pesagem. Fold online: a pesagem volta nos dois aparelhos, com o valor do Fold.
3. Atualize por cima da versão de teste 1, sem apagar o app: tudo continua lá. Um protocolo encerrado em modo avião antes de atualizar continua Encerrado depois.
4. A leitura de exame ainda funciona.
5. Jornada: compare a curva com um print da versão de teste 1. Os números são os mesmos.
6. Fold: refaça o 9.7 (barra de baixo) com a barra de tarefas aparecendo E escondida.
