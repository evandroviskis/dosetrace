<!-- Para o fundador aprovar. Mesmo texto que o app mostra em Ajustes › Política de privacidade (pt). A parte "Para o advogado" não é publicada: sai antes de ir para o site. -->

## Para o advogado (não publicar)

Pontos que o texto abaixo deixa como estão, porque só um advogado pode decidir a redação:

1. **Retenção na Anthropic.** O texto agora diz (fundador 2026-10-16) que a Anthropic "apaga em até 30 dias, guardando por mais tempo apenas quando necessário para fazer cumprir a política de uso dela ou a lei". Confirmar esse prazo nos termos comerciais / DPA da Anthropic e se o DPA cobre texto livre (refeições descritas, respostas ao assistente de protocolos).
2. **RevenueCat ao excluir a conta.** Excluir a conta apaga os dados sincronizados e o login dos nossos servidores, mas o cliente no RevenueCat (ID da conta + histórico de compras) não é apagado. Decidir se precisa ser apagado ou se basta dizer isso na política (DL-83).
3. **Análises de uso ligadas por padrão.** Os eventos de uso vêm ativados (opt-out) com um ID aleatório da instalação. Confirmar se isso é aceitável pela diretiva ePrivacy, art. 5(3), na UE, ou se precisa de consentimento antes (DL-83).
4. **Dados de saúde (GDPR art. 9 / LGPD dados sensíveis).** O perfil completo, inclusive "o que você acompanha" (peptídeos, hormônios / TRT, GLP-1, suplementos), é obrigatório para usar o app (decisão do build 49). Confirmar a base legal e se a obrigatoriedade é aceitável (decisions.md:388).
5. **Prova do consentimento de IA.** O aceite do envio para a IA fica guardado só no aparelho, não na conta nem no servidor; uma próxima conta no mesmo celular herda o aceite (DL-83, A-95).
6. **Transferência internacional.** A seção 10 diz apenas que os dados vão para os EUA "com as proteções descritas nesta política"; confirmar se é preciso citar o mecanismo (cláusulas-padrão / Data Privacy Framework) de cada provedor.

---

# DoseTrace — Política de Privacidade

Última atualização: 25 de outubro de 2026

A Outcom (“nós”) opera o aplicativo DoseTrace para iPhone e Android. Esta política explica quais informações o app trata, para onde elas vão e o que você pode fazer a respeito. O DoseTrace é um diário pessoal e uma calculadora. Ele não dá orientação médica.

## 1. As informações que você nos dá

**Conta.** Seu endereço de e-mail ou os dados da conta que a Apple ou o Google compartilham quando você escolhe “Continuar com a Apple” ou “Continuar com o Google” (seu e-mail, ou um endereço de retransmissão privado da Apple, e o nome que você permitir). Esse login é feito pela Apple e pelo Google. Se você entra com a Apple, guardamos no nosso servidor um token da Apple para poder encerrar o seu login com a Apple quando você excluir a sua conta. Se você usa e-mail, sua senha fica com o nosso provedor de autenticação e nunca é guardada em formato legível.

**Perfil (necessário para usar o app).** Nome, mês e ano de nascimento, país, sexo atribuído no nascimento, seus objetivos, nível de atividade, o que você acompanha (peptídeos, hormônios / TRT, GLP-1 / emagrecimento, suplementos orais) e se você é acompanhado por um profissional de saúde. O app pede todos esses dados antes que você possa usá-lo e os usa para personalizar as telas e fazer as contas das calculadoras. Nas calculadoras, você também pode informar sua altura, seu peso, seu percentual de gordura corporal e suas medidas.

**Dados de saúde e do diário.** Os protocolos que você cria (compostos, doses, frequências, horários dos lembretes), as doses que você registra (tomadas, puladas, locais de aplicação), frascos, resultados de exames, registros de vacinação, as refeições do registro de comida com os valores nutricionais estimados, as pesagens, os resultados de “Seus números reais” e as anotações que você escreve.

## 2. Onde suas informações ficam

Seus dados ficam salvos em um banco de dados no seu celular. Quando você tem uma conta, eles também são sincronizados com o nosso banco de dados na nuvem, hospedado pela **Supabase** (Estados Unidos), para ter backup e ficar disponíveis nos seus outros aparelhos. Os dados são criptografados em trânsito (TLS) e também criptografados em repouso pelo nosso provedor de hospedagem. Os tokens de acesso ficam no armazenamento seguro do seu celular.

Sair da conta remove os seus registros do DoseTrace do app naquele celular; eles continuam na sua conta e voltam quando você entra de novo. Os arquivos que você exportou continuam onde foram salvos.

## 3. Para que usamos

Apenas para fazer o DoseTrace funcionar para você: mostrar o seu diário, calcular os seus números, agendar os seus lembretes, sincronizar os seus aparelhos e manter a sua conta funcionando. Não vendemos suas informações, não mostramos anúncios e não compartilhamos seus dados de saúde com seguradoras, empregadores, anunciantes ou corretores de dados.

## 4. Lembretes e notificações

Os lembretes de dose, de frasco, do registro de comida e de check-in são agendados no seu celular. Para que os lembretes continuem chegando no Android mesmo quando você não abre o app (o Android pode pausar apps que não são abertos), nosso servidor envia ao seu celular Android uma mensagem silenciosa por dia. Ela não tem texto nem dados de saúde; só pede ao app que atualize os lembretes que já estão no seu celular.

Para entregar as notificações, guardamos um token de notificação do aparelho junto com a sua conta. As notificações passam pelo **Expo** (nosso serviço de notificações push), pelo **Google Firebase Cloud Messaging** no Android e pelo **Apple Push Notification service** no iPhone. Você pode desativar os lembretes ou usar o Modo silencioso em Ajustes quando quiser. As atualizações do app que corrigem problemas são entregues pelo **Expo**; para isso, o app informa a plataforma, a versão do app e um identificador aleatório da instalação, nunca a sua conta nem dados de saúde.

**Mensagens da equipe DoseTrace.** Podemos enviar à sua conta uma mensagem curta sobre a conta ou o suporte (por exemplo, que o seu acesso Premium foi liberado ou que um problema relatado por você foi corrigido). Ela chega como notificação, a menos que as notificações estejam desativadas ou o Modo silencioso esteja ligado, e também aparece dentro do app, em Ajustes › Suporte › Mensagens da equipe. Nunca usamos essas mensagens para orientação de saúde, dose ou tratamento. As mensagens ficam guardadas com a sua conta e são apagadas quando você exclui a conta; registramos também quando cada uma foi enviada, para quantos aparelhos e quando foi lida. Para escrever o título da notificação no seu idioma, o app guarda o idioma escolhido junto com a sua conta. As mensagens que escrevemos para você podem ser traduzidas pelo nosso provedor de IA.

## 5. Recursos de IA (opcionais, só com a sua permissão)

Você pode usar a IA para não precisar digitar: escanear um exame de laboratório, uma carteira de vacinação ou o rótulo de um frasco, descrever suas refeições no registro de comida com IA ou responder às perguntas do assistente de protocolos. Só nesses casos, e só depois que você concordar no app (perguntamos de novo quando um novo tipo de dado for enviado), a foto, o PDF ou o texto que você escolheu é enviado à **Anthropic PBC** (Estados Unidos) para extrair ou estimar os valores. A Anthropic atua como nossa operadora de dados apenas nessa tarefa: trata o que você enviou somente para aquele pedido, não usa esse conteúdo para treinar os modelos dela e o apaga em até 30 dias, guardando por mais tempo apenas quando necessário para fazer cumprir a política de uso dela ou a lei. A IA nunca interpreta os seus resultados e nunca dá orientação médica, de doses ou de alimentação. Você sempre pode digitar as informações por conta própria. Guardamos quantos pedidos à IA você fez (para os limites: leituras por mês, registro de comida com IA por dia e assistente de protocolos por semana), não o conteúdo deles.

## 6. Compras

As assinaturas são pagas pela **Apple App Store** ou pelo **Google Play**; nunca vemos o seu cartão. O **RevenueCat** informa ao app se a sua assinatura está ativa; para isso, recebe o ID da sua conta DoseTrace e o seu histórico de compras da loja. Nosso servidor também consulta o **RevenueCat** para saber se você tem o Premium e aplicar os limites mensais de IA do seu plano.

## 7. Dados de uso do app (você pode desativar)

Para melhorar o app, registramos eventos de uso (por exemplo, que uma tela foi aberta ou que uma dose foi registrada) no nosso próprio banco de dados na **Supabase**, com um ID aleatório da instalação. Esses eventos não ficam ligados à sua conta: nunca levam o ID da sua conta nem detalhes de saúde, como nomes de compostos, doses ou o que você pesquisou. Isso vem ativado até você desativar: você pode desligar “Análises de uso” quando quiser em Ajustes › Dados e privacidade.

## 8. Por quanto tempo guardamos

Enquanto a sua conta existir. Um protocolo que você exclui vai para “Excluídos recentemente” e fica lá, para você poder restaurá-lo, até você escolher “Excluir para sempre”. Excluir para sempre apaga o conteúdo dele (nome, doses, frequência, anotações) e também os registros de dose e os frascos; fica só uma marca mínima (um ID, o tipo, a cor e as datas) para que os seus outros celulares saibam que ele foi excluído. Excluir a sua conta em Ajustes apaga de forma definitiva dos nossos servidores os seus dados sincronizados e o seu login; os dados no seu celular são apagados quando você desinstala o app ou sai da conta.

## 9. Suas escolhas e seus direitos

Você pode ver, alterar e excluir seus dados no app, e excluir a sua conta inteira em Ajustes. “Baixar meus dados”, em Ajustes, exporta os seus registros; para qualquer dado que não esteja ali, ou para pedir a exclusão, escreva para hello@dosetrace.io. Dependendo de onde você mora (por exemplo, na União Europeia, no Reino Unido, no Brasil ou na Califórnia), você tem o direito de acessar, corrigir, excluir e levar seus dados para outro serviço, e de se opor ao uso deles; atendemos a esses pedidos de todas as pessoas.

## 10. Transferência internacional

Nossos provedores tratam os dados nos Estados Unidos. Quando você usa o DoseTrace de outro país, seus dados são transferidos para lá com as proteções descritas nesta política.

## 11. Menores de idade

O DoseTrace é só para adultos: é preciso ter 18 anos ou mais para usá-lo. Se soubermos que foram coletados dados de um menor de idade, nós os apagamos.

## 12. Segurança

Usamos medidas técnicas e organizacionais de proteção (criptografia, regras de acesso por linha para que cada conta só consiga ler os próprios dados, armazenamento seguro dos tokens). Nenhum sistema é totalmente seguro; se você notar algum problema, avise-nos em hello@dosetrace.io.

## 13. Alterações

Quando esta política mudar, atualizamos este texto e a data acima.

## 14. Contato

Outcom — hello@dosetrace.io
