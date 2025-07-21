#!/usr/bin/env python3
"""
Facebook CAPI Test Suite
Suíte completa de testes para validar implementação Pixel + Conversions API

Uso:
python capi_test_suite.py --pixel-id YOUR_PIXEL_ID --access-token YOUR_TOKEN
"""

import requests
import json
import time
import uuid
import argparse
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import random

class CAPITestSuite:
    def __init__(self, pixel_id: str, access_token: str):
        self.pixel_id = pixel_id
        self.access_token = access_token
        self.base_url = "https://graph.facebook.com/v18.0"
        self.test_results = []
        
    def generate_test_user_data(self) -> Dict:
        """Gera dados de usuário de teste realistas"""
        test_emails = [
            "test.user@example.com",
            "qa.tester@testdomain.com", 
            "validation@qasite.com"
        ]
        
        test_phones = [
            "+5511999999999",
            "+5521888888888",
            "+5531777777777"
        ]
        
        return {
            "em": [random.choice(test_emails)],
            "ph": [random.choice(test_phones)],
            "client_ip_address": f"192.168.1.{random.randint(1, 254)}",
            "client_user_agent": "Mozilla/5.0 (Test Suite) CAPI Validator v1.0",
            "fbp": f"fb.1.{int(time.time())}.{random.randint(1000000, 9999999)}",
            "fbc": f"fb.1.{int(time.time())}.AbCdEfGhIjKlMnOpQrStUvWxYz{random.randint(1000000, 9999999)}"
        }
    
    def test_basic_event_sending(self, test_code: str) -> Dict:
        """Teste 1: Envio básico de evento"""
        print("🧪 Teste 1: Envio básico de evento...")
        
        event_data = {
            "data": [{
                "event_name": "Purchase",
                "event_time": int(time.time()),
                "event_id": f"test_basic_{uuid.uuid4().hex[:8]}",
                "action_source": "website",
                "event_source_url": "https://example.com/test-basic",
                "user_data": self.generate_test_user_data(),
                "custom_data": {
                    "value": 99.99,
                    "currency": "BRL",
                    "content_ids": ["test_product_basic"]
                }
            }],
            "test_event_code": test_code
        }
        
        try:
            response = requests.post(
                f"{self.base_url}/{self.pixel_id}/events",
                params={'access_token': self.access_token},
                headers={'Content-Type': 'application/json'},
                json=event_data
            )
            
            success = response.status_code == 200
            result = {
                'test': 'basic_event_sending',
                'success': success,
                'status_code': response.status_code,
                'response': response.json() if success else response.text,
                'event_id': event_data['data'][0]['event_id']
            }
            
            if success:
                print("   ✅ Evento básico enviado com sucesso")
            else:
                print(f"   ❌ Falha no envio: {response.text}")
                
            return result
            
        except Exception as e:
            print(f"   ❌ Erro na requisição: {e}")
            return {
                'test': 'basic_event_sending',
                'success': False,
                'error': str(e)
            }
    
    def test_deduplication(self, test_code: str) -> Dict:
        """Teste 2: Deduplicação com mesmo Event ID"""
        print("🧪 Teste 2: Deduplicação (mesmo Event ID)...")
        
        event_id = f"test_dedup_{uuid.uuid4().hex[:8]}"
        user_data = self.generate_test_user_data()
        
        # Enviar primeiro evento
        event1 = {
            "data": [{
                "event_name": "AddToCart",
                "event_time": int(time.time()),
                "event_id": event_id,  # MESMO ID
                "action_source": "website",
                "event_source_url": "https://example.com/test-dedup-1",
                "user_data": user_data,
                "custom_data": {
                    "value": 29.99,
                    "currency": "BRL",
                    "content_ids": ["test_product_dedup"]
                }
            }],
            "test_event_code": test_code
        }
        
        # Enviar segundo evento (simulando CAPI)
        event2 = {
            "data": [{
                "event_name": "AddToCart",
                "event_time": int(time.time()) + 2,  # 2 segundos depois
                "event_id": event_id,  # MESMO ID
                "action_source": "website",
                "event_source_url": "https://example.com/test-dedup-2",
                "user_data": user_data,
                "custom_data": {
                    "value": 29.99,
                    "currency": "BRL",
                    "content_ids": ["test_product_dedup"]
                }
            }],
            "test_event_code": test_code
        }
        
        try:
            # Enviar primeiro evento
            response1 = requests.post(
                f"{self.base_url}/{self.pixel_id}/events",
                params={'access_token': self.access_token},
                headers={'Content-Type': 'application/json'},
                json=event1
            )
            
            time.sleep(3)  # Aguardar processamento
            
            # Enviar segundo evento
            response2 = requests.post(
                f"{self.base_url}/{self.pixel_id}/events",
                params={'access_token': self.access_token},
                headers={'Content-Type': 'application/json'},
                json=event2
            )
            
            success = response1.status_code == 200 and response2.status_code == 200
            
            result = {
                'test': 'deduplication',
                'success': success,
                'event_id': event_id,
                'response1': response1.json() if response1.status_code == 200 else response1.text,
                'response2': response2.json() if response2.status_code == 200 else response2.text
            }
            
            if success:
                print("   ✅ Eventos de deduplicação enviados com sucesso")
                print(f"   📋 Event ID para verificação: {event_id}")
            else:
                print("   ❌ Falha no teste de deduplicação")
                
            return result
            
        except Exception as e:
            print(f"   ❌ Erro no teste de deduplicação: {e}")
            return {
                'test': 'deduplication',
                'success': False,
                'error': str(e)
            }
    
    def test_event_match_score(self, test_code: str) -> Dict:
        """Teste 3: Event Match Score com dados completos"""
        print("🧪 Teste 3: Event Match Score (dados completos)...")
        
        # Dados de usuário otimizados para alto match score
        rich_user_data = {
            "em": ["qa.tester@example.com"],
            "ph": ["+5511999999999"],
            "client_ip_address": "192.168.1.100",
            "client_user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "fbp": f"fb.1.{int(time.time())}.{random.randint(1000000, 9999999)}",
            "fbc": f"fb.1.{int(time.time())}.AbCdEfGhIjKlMnOpQrStUvWxYz{random.randint(1000000, 9999999)}",
            "first_names": ["Test"],
            "last_names": ["User"],
            "date_of_birth": "19900101",
            "genders": ["m"],
            "cities": ["sao paulo"],
            "states": ["sp"],
            "zip_codes": ["01234567"],
            "countries": ["br"]
        }
        
        event_data = {
            "data": [{
                "event_name": "Purchase",
                "event_time": int(time.time()),
                "event_id": f"test_match_score_{uuid.uuid4().hex[:8]}",
                "action_source": "website",
                "event_source_url": "https://example.com/test-match-score",
                "user_data": rich_user_data,
                "custom_data": {
                    "value": 149.99,
                    "currency": "BRL",
                    "content_ids": ["premium_product"],
                    "content_type": "product",
                    "num_items": 1
                }
            }],
            "test_event_code": test_code
        }
        
        try:
            response = requests.post(
                f"{self.base_url}/{self.pixel_id}/events",
                params={'access_token': self.access_token},
                headers={'Content-Type': 'application/json'},
                json=event_data
            )
            
            success = response.status_code == 200
            result = {
                'test': 'event_match_score',
                'success': success,
                'user_data_fields': len(rich_user_data),
                'event_id': event_data['data'][0]['event_id'],
                'response': response.json() if success else response.text
            }
            
            if success:
                print("   ✅ Evento com dados completos enviado")
                print(f"   📊 {len(rich_user_data)} campos de user_data enviados")
            else:
                print(f"   ❌ Falha no teste de match score: {response.text}")
                
            return result
            
        except Exception as e:
            print(f"   ❌ Erro no teste de match score: {e}")
            return {
                'test': 'event_match_score',
                'success': False,
                'error': str(e)
            }
    
    def test_latency_freshness(self, test_code: str) -> Dict:
        """Teste 4: Latência e Freshness"""
        print("🧪 Teste 4: Latência e Freshness...")
        
        # Evento em tempo real
        real_time_event = {
            "data": [{
                "event_name": "ViewContent",
                "event_time": int(time.time()),  # Agora
                "event_id": f"test_realtime_{uuid.uuid4().hex[:8]}",
                "action_source": "website",
                "event_source_url": "https://example.com/test-realtime",
                "user_data": self.generate_test_user_data(),
                "custom_data": {
                    "content_ids": ["test_content_realtime"],
                    "content_type": "product"
                }
            }],
            "test_event_code": test_code
        }
        
        # Evento com 10 minutos de atraso (ainda aceitável)
        delayed_event = {
            "data": [{
                "event_name": "ViewContent",
                "event_time": int(time.time()) - 600,  # 10 minutos atrás
                "event_id": f"test_delayed_{uuid.uuid4().hex[:8]}",
                "action_source": "website",
                "event_source_url": "https://example.com/test-delayed",
                "user_data": self.generate_test_user_data(),
                "custom_data": {
                    "content_ids": ["test_content_delayed"],
                    "content_type": "product"
                }
            }],
            "test_event_code": test_code
        }
        
        try:
            # Enviar evento em tempo real
            start_time = time.time()
            response1 = requests.post(
                f"{self.base_url}/{self.pixel_id}/events",
                params={'access_token': self.access_token},
                headers={'Content-Type': 'application/json'},
                json=real_time_event
            )
            end_time = time.time()
            api_latency = (end_time - start_time) * 1000  # em ms
            
            # Enviar evento com atraso
            response2 = requests.post(
                f"{self.base_url}/{self.pixel_id}/events",
                params={'access_token': self.access_token},
                headers={'Content-Type': 'application/json'},
                json=delayed_event
            )
            
            success = response1.status_code == 200 and response2.status_code == 200
            
            result = {
                'test': 'latency_freshness',
                'success': success,
                'api_latency_ms': round(api_latency, 2),
                'realtime_event_id': real_time_event['data'][0]['event_id'],
                'delayed_event_id': delayed_event['data'][0]['event_id'],
                'delay_minutes': 10
            }
            
            if success:
                print(f"   ✅ Eventos de latência enviados (API: {api_latency:.2f}ms)")
            else:
                print("   ❌ Falha no teste de latência")
                
            return result
            
        except Exception as e:
            print(f"   ❌ Erro no teste de latência: {e}")
            return {
                'test': 'latency_freshness',
                'success': False,
                'error': str(e)
            }
    
    def test_invalid_timestamps(self, test_code: str) -> Dict:
        """Teste 5: Timestamps inválidos (devem ser rejeitados)"""
        print("🧪 Teste 5: Timestamps inválidos...")
        
        now = int(time.time())
        
        # Evento muito antigo (>7 dias) - deve ser rejeitado
        old_event = {
            "data": [{
                "event_name": "Purchase",
                "event_time": now - (8 * 24 * 60 * 60),  # 8 dias atrás
                "event_id": f"test_old_{uuid.uuid4().hex[:8]}",
                "action_source": "website",
                "event_source_url": "https://example.com/test-old",
                "user_data": self.generate_test_user_data(),
                "custom_data": {
                    "value": 99.99,
                    "currency": "BRL"
                }
            }],
            "test_event_code": test_code
        }
        
        # Evento no futuro - deve ser rejeitado
        future_event = {
            "data": [{
                "event_name": "Purchase", 
                "event_time": now + 3600,  # 1 hora no futuro
                "event_id": f"test_future_{uuid.uuid4().hex[:8]}",
                "action_source": "website",
                "event_source_url": "https://example.com/test-future",
                "user_data": self.generate_test_user_data(),
                "custom_data": {
                    "value": 99.99,
                    "currency": "BRL"
                }
            }],
            "test_event_code": test_code
        }
        
        try:
            # Tentar enviar evento muito antigo
            response1 = requests.post(
                f"{self.base_url}/{self.pixel_id}/events",
                params={'access_token': self.access_token},
                headers={'Content-Type': 'application/json'},
                json=old_event
            )
            
            # Tentar enviar evento no futuro
            response2 = requests.post(
                f"{self.base_url}/{self.pixel_id}/events",
                params={'access_token': self.access_token},
                headers={'Content-Type': 'application/json'},
                json=future_event
            )
            
            # Esperamos que pelo menos um seja rejeitado
            old_rejected = response1.status_code != 200
            future_rejected = response2.status_code != 200
            
            result = {
                'test': 'invalid_timestamps',
                'old_event_rejected': old_rejected,
                'future_event_rejected': future_rejected,
                'old_response': response1.text if old_rejected else response1.json(),
                'future_response': response2.text if future_rejected else response2.json()
            }
            
            if old_rejected or future_rejected:
                print("   ✅ Timestamps inválidos rejeitados corretamente")
            else:
                print("   ⚠️ Timestamps inválidos foram aceitos (inesperado)")
                
            return result
            
        except Exception as e:
            print(f"   ❌ Erro no teste de timestamps: {e}")
            return {
                'test': 'invalid_timestamps',
                'success': False,
                'error': str(e)
            }
    
    def test_multiple_events_batch(self, test_code: str) -> Dict:
        """Teste 6: Envio em lote de múltiplos eventos"""
        print("🧪 Teste 6: Envio em lote (múltiplos eventos)...")
        
        events = []
        for i in range(5):
            events.append({
                "event_name": "ViewContent",
                "event_time": int(time.time()) - (i * 60),  # 1 minuto de diferença
                "event_id": f"test_batch_{i}_{uuid.uuid4().hex[:8]}",
                "action_source": "website",
                "event_source_url": f"https://example.com/test-batch-{i}",
                "user_data": self.generate_test_user_data(),
                "custom_data": {
                    "content_ids": [f"batch_product_{i}"],
                    "content_type": "product"
                }
            })
        
        batch_data = {
            "data": events,
            "test_event_code": test_code
        }
        
        try:
            response = requests.post(
                f"{self.base_url}/{self.pixel_id}/events",
                params={'access_token': self.access_token},
                headers={'Content-Type': 'application/json'},
                json=batch_data
            )
            
            success = response.status_code == 200
            result = {
                'test': 'multiple_events_batch',
                'success': success,
                'events_count': len(events),
                'event_ids': [e['event_id'] for e in events],
                'response': response.json() if success else response.text
            }
            
            if success:
                print(f"   ✅ Lote de {len(events)} eventos enviado com sucesso")
            else:
                print(f"   ❌ Falha no envio em lote: {response.text}")
                
            return result
            
        except Exception as e:
            print(f"   ❌ Erro no teste de lote: {e}")
            return {
                'test': 'multiple_events_batch',
                'success': False,
                'error': str(e)
            }
    
    def run_all_tests(self) -> Dict:
        """Executa todos os testes da suíte"""
        print("🚀 Iniciando Suíte de Testes Facebook CAPI")
        print("="*50)
        
        # Gerar código de teste único
        test_code = f"SUITE-{int(time.time())}"
        print(f"🔍 Test Code: {test_code}")
        print(f"📋 Use este código no Events Manager > Test Events\n")
        
        # Executar todos os testes
        tests = [
            self.test_basic_event_sending,
            self.test_deduplication,
            self.test_event_match_score,
            self.test_latency_freshness,
            self.test_invalid_timestamps,
            self.test_multiple_events_batch
        ]
        
        results = []
        for test_func in tests:
            try:
                result = test_func(test_code)
                results.append(result)
                time.sleep(2)  # Pausa entre testes
            except Exception as e:
                print(f"   ❌ Erro inesperado no teste: {e}")
                results.append({
                    'test': test_func.__name__,
                    'success': False,
                    'error': str(e)
                })
        
        # Gerar relatório final
        report = self.generate_test_report(results, test_code)
        return report
    
    def generate_test_report(self, results: List[Dict], test_code: str) -> Dict:
        """Gera relatório final dos testes"""
        successful_tests = sum(1 for r in results if r.get('success', False))
        total_tests = len(results)
        success_rate = (successful_tests / total_tests * 100) if total_tests > 0 else 0
        
        report = {
            'test_code': test_code,
            'timestamp': datetime.now().isoformat(),
            'total_tests': total_tests,
            'successful_tests': successful_tests,
            'failed_tests': total_tests - successful_tests,
            'success_rate': round(success_rate, 1),
            'results': results
        }
        
        self.print_test_report(report)
        return report
    
    def print_test_report(self, report: Dict):
        """Imprime relatório formatado dos testes"""
        print("\n" + "="*50)
        print("📊 RELATÓRIO FINAL - SUÍTE DE TESTES")
        print("="*50)
        
        print(f"\n🔍 Test Code: {report['test_code']}")
        print(f"📅 Timestamp: {report['timestamp']}")
        print(f"🎯 Pixel ID: {self.pixel_id}")
        
        print(f"\n📈 RESUMO:")
        print(f"   Total de testes: {report['total_tests']}")
        print(f"   Sucessos: {report['successful_tests']}")
        print(f"   Falhas: {report['failed_tests']}")
        print(f"   Taxa de sucesso: {report['success_rate']}%")
        
        print(f"\n📋 DETALHES DOS TESTES:")
        for i, result in enumerate(report['results'], 1):
            test_name = result.get('test', 'unknown')
            success = result.get('success', False)
            status = "✅ PASSOU" if success else "❌ FALHOU"
            print(f"   {i}. {test_name}: {status}")
            
            if 'event_id' in result:
                print(f"      Event ID: {result['event_id']}")
            if 'error' in result:
                print(f"      Erro: {result['error']}")
        
        print(f"\n💡 PRÓXIMOS PASSOS:")
        print(f"   1. Acesse Events Manager > Test Events")
        print(f"   2. Insira o Test Code: {report['test_code']}")
        print(f"   3. Verifique se todos os eventos apareceram")
        print(f"   4. Analise Event Match Score e deduplicação")
        print(f"   5. Verifique latência dos eventos")
        
        if report['success_rate'] >= 80:
            print(f"\n🎉 EXCELENTE! Sua implementação CAPI está funcionando bem!")
        elif report['success_rate'] >= 60:
            print(f"\n⚠️ BOM, mas há pontos para melhorar na implementação.")
        else:
            print(f"\n🚨 ATENÇÃO! Implementação precisa de correções urgentes.")
        
        print("="*50)

def main():
    parser = argparse.ArgumentParser(description='Suíte de testes Facebook CAPI')
    parser.add_argument('--pixel-id', required=True, help='ID do Pixel do Facebook')
    parser.add_argument('--access-token', required=True, help='Token de acesso da Graph API')
    parser.add_argument('--save-report', help='Salvar relatório em arquivo JSON')
    
    args = parser.parse_args()
    
    test_suite = CAPITestSuite(args.pixel_id, args.access_token)
    report = test_suite.run_all_tests()
    
    if args.save_report:
        with open(args.save_report, 'w') as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        print(f"\n💾 Relatório salvo em: {args.save_report}")

if __name__ == "__main__":
    main()