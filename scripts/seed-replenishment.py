import asyncio
import os
import json
import random
import sys
from playwright.async_api import async_playwright

async def seed_data():
    storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    supabase_url = os.environ.get("VITE_SUPABASE_URL")
    anon_key = os.environ.get("VITE_SUPABASE_ANON_KEY")

    if not all([storage_key, session_json, supabase_url, anon_key]):
        print("Erro: Variáveis de ambiente do Supabase não encontradas. Certifique-se de estar no ambiente sandbox do Lovable.")
        sys.exit(1)

    print("Iniciando seed de dados mestres...")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()
        
        # Restaurar sessão no localStorage
        await page.goto("http://localhost:8080")
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session_json)})"
        )
        
        await page.goto("http://localhost:8080")
        
        seed_script = """
        async (args) => {
          const { storageKey, url, anonKey } = args;
          const session = JSON.parse(window.localStorage.getItem(storageKey));
          const token = session.access_token;
          const companyId = session.user.user_metadata?.company_id || session.user.id;
          
          const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': anonKey,
            'Prefer': 'return=representation'
          };

          const post = async (table, body) => {
            const res = await fetch(`${url}/rest/v1/${table}`, {
              method: 'POST',
              headers,
              body: JSON.stringify(body)
            });
            if (!res.ok) {
                const err = await res.text();
                throw new Error(`Erro ao postar em ${table}: ${err}`);
            }
            return await res.json();
          };

          // 1. Obter company_id real do perfil
          const profileRes = await fetch(`${url}/rest/v1/profiles?id=eq.${session.user.id}`, { headers });
          const profiles = await profileRes.json();
          const realCompanyId = (profiles && profiles.length > 0) ? profiles[0].company_id : companyId;

          const suffix = Math.floor(Math.random() * 9000) + 1000;
          
          console.log(`Criando filiais com sufixo ${suffix}...`);
          const branchInd = await post('branches', {
            name: `Indústria Central ${suffix}`,
            code: `IND-${suffix}`,
            tipo: 'industria',
            canal_padrao: 'ATACADO_INDUSTRIA',
            company_id: realCompanyId,
            is_active: true
          });
          
          const branchStore = await post('branches', {
            name: `Loja Shopping ${suffix}`,
            code: `STR-${suffix}`,
            tipo: 'filial',
            canal_padrao: 'VAREJO_PDV',
            company_id: realCompanyId,
            is_active: true
          });
          
          console.log(`Criando produto de teste...`);
          const product = await post('products', {
            name: `Produto Teste ${suffix}`,
            code: `PROD-${suffix}`,
            min_stock: 50,
            company_id: realCompanyId,
            item_kind: 'revenda'
          });
          
          console.log(`Gerando saldos de estoque (Surplus na Indústria, Ruptura na Loja)...`);
          await post('stock_balances', [
            {
              company_id: realCompanyId,
              branch_id: branchInd[0].id,
              product_id: product[0].id,
              product_code: product[0].code,
              product_name: product[0].name,
              quantity: 500,
              canal_operacional: 'ATACADO_INDUSTRIA'
            },
            {
              company_id: realCompanyId,
              branch_id: branchStore[0].id,
              product_id: product[0].id,
              product_code: product[0].code,
              product_name: product[0].name,
              quantity: 5,
              canal_operacional: 'VAREJO_PDV'
            }
          ]);
          
          return { branchInd: branchInd[0].name, branchStore: branchStore[0].name, product: product[0].name };
        }
        """
        
        try:
            result = await page.evaluate(seed_script, {
                "storageKey": storage_key,
                "url": supabase_url,
                "anonKey": anon_key
            })
            print(f"Seed concluído com sucesso!")
            print(f"Filial Industrial: {result['branchInd']}")
            print(f"Filial Varejo: {result['branchStore']}")
            print(f"Produto: {result['product']}")
        except Exception as e:
            print(f"Erro durante o seed: {str(e)}")
            sys.exit(1)
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(seed_data())
