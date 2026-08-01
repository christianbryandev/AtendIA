import Section from '../../../components/ui/Section';

const PERGUNTAS = [
  {
    q: 'Preciso trocar o número que já uso?',
    a: 'Não. O AtendIA funciona com o número que seus clientes já conhecem, conectado pela API oficial do WhatsApp Business.',
  },
  {
    q: 'E se a IA errar um pedido?',
    a: 'Todo pedido aparece no seu painel antes de ir para a produção — você confere e corrige se precisar. A IA é uma ferramenta de atendimento, e a palavra final é sempre sua. Se preferir, dá para desligar o atendimento automático a qualquer momento e assumir a conversa.',
  },
  {
    q: 'Meu cardápio do iFood entra automático?',
    a: 'Sim, a importação traz categorias e produtos do seu iFood. Depois você pode editar tudo e acrescentar itens que só existem no seu delivery próprio.',
  },
  {
    q: 'E se meus créditos acabarem no meio do mês?',
    a: 'O atendimento automático fica suspenso até a renovação ou até você comprar um pacote avulso. O painel, o PDV e todo o resto continuam funcionando normalmente, e você recebe aviso antes de chegar no limite.',
  },
  {
    q: 'Posso cancelar quando quiser?',
    a: 'Pode, pelo painel ou por e-mail. Não há multa nem fidelidade. O cancelamento interrompe as próximas cobranças e você mantém o acesso até o fim do período já pago.',
  },
  {
    q: 'Meus dados e os dos meus clientes estão seguros?',
    a: 'Cada restaurante fica isolado no banco de dados, senhas são criptografadas e as credenciais de integração ficam cifradas. As mensagens do WhatsApp passam por verificação criptográfica. A Política de Privacidade detalha quais dados tratamos e com quais fornecedores eles são compartilhados.',
  },
];

export default function Faq() {
  return (
    <Section id="perguntas">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-center text-3xl font-bold tracking-tight text-ink-800 sm:text-4xl">
          Perguntas frequentes
        </h2>

        <dl className="mt-12 divide-y divide-stone-200 border-y border-stone-200">
          {PERGUNTAS.map((item) => (
            <div key={item.q} className="py-6">
              <dt className="font-semibold text-ink-800">{item.q}</dt>
              <dd className="mt-2.5 text-[15px] leading-relaxed text-ink-600">{item.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  );
}
