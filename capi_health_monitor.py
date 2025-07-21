#!/usr/bin/env python3
"""
Facebook CAPI Health Monitor
Monitora a saúde da implementação Pixel + Conversions API

Uso:
python capi_health_monitor.py --pixel-id YOUR_PIXEL_ID --access-token YOUR_TOKEN
"""

import requests
import json
import time
import argparse
from datetime import datetime, timedelta
from typing import Dict, List, Tuple
import hashlib

class CAPIHealthMonitor:
    def __init__(self, pixel_id: str, access_token: str):
        self.pixel_id = pixel_id
        self.access_token = access_token
        self.base_url = "https://graph.facebook.com/v18.0"
        
    def check_token_validity(self) -> bool:
        """Verifica se o token de acesso está válido"""
        try:
            response = requests.get(
                f"{self.base_url}/me",
                params={'access_token': self.access_token}
            )
            return response.status_code == 200
        except Exception as e:
            print(f"❌ Erro ao verificar token: {e}")
            return False
    
    def get_recent_events(self, limit: int = 100) -> List[Dict]:
        """Busca eventos recentes do pixel"""
        try:
            response = requests.get(
                f"{self.base_url}/{self.pixel_id}/events",
                params={
                    'access_token': self.access_token,
                    'limit': limit
                }
            )
            
            if response.status_code == 200:
                return response.json().get('data', [])
            else:
                print(f"❌ Erro ao buscar eventos: {response.text}")
                return []
        except Exception as e:
            print(f"❌ Erro na requisição: {e}")
            return []
    
    def analyze_deduplication(self, events: List[Dict]) -> Dict:
        """Analisa a taxa de deduplicação dos eventos"""
        event_ids = {}
        total_events = len(events)
        duplicated_events = 0
        
        for event in events:
            event_id = event.get('event_id')
            if event_id:
                if event_id in event_ids:
                    event_ids[event_id].append(event)
                    duplicated_events += 1
                else:
                    event_ids[event_id] = [event]
        
        unique_events = len(event_ids)
        deduplication_rate = (duplicated_events / total_events * 100) if total_events > 0 else 0
        
        return {
            'total_events': total_events,
            'unique_events': unique_events,
            'duplicated_events': duplicated_events,
            'deduplication_rate': deduplication_rate
        }
    
    def analyze_connection_methods(self, events: List[Dict]) -> Dict:
        """Analisa a distribuição de métodos de conexão (browser vs server)"""
        browser_events = 0
        server_events = 0
        unknown_events = 0
        
        for event in events:
            connection_method = event.get('connection_method', 'unknown')
            if connection_method == 'browser':
                browser_events += 1
            elif connection_method == 'server_side':
                server_events += 1
            else:
                unknown_events += 1
        
        total = len(events)
        capi_coverage = (server_events / total * 100) if total > 0 else 0
        
        return {
            'browser_events': browser_events,
            'server_events': server_events,
            'unknown_events': unknown_events,
            'total_events': total,
            'capi_coverage': capi_coverage
        }
    
    def analyze_latency(self, events: List[Dict]) -> Dict:
        """Analisa a latência dos eventos"""
        latencies = []
        
        for event in events:
            event_time = event.get('event_time')
            received_time = event.get('received_time')
            
            if event_time and received_time:
                latency = received_time - event_time
                latencies.append(latency)
        
        if latencies:
            avg_latency = sum(latencies) / len(latencies)
            max_latency = max(latencies)
            min_latency = min(latencies)
        else:
            avg_latency = max_latency = min_latency = 0
        
        return {
            'avg_latency_seconds': avg_latency,
            'max_latency_seconds': max_latency,
            'min_latency_seconds': min_latency,
            'avg_latency_minutes': avg_latency / 60,
            'events_with_latency': len(latencies)
        }
    
    def check_event_timestamps(self, events: List[Dict]) -> Dict:
        """Verifica se os timestamps dos eventos estão dentro dos limites"""
        now = int(time.time())
        max_age = 7 * 24 * 60 * 60  # 7 dias
        
        valid_timestamps = 0
        old_timestamps = 0
        future_timestamps = 0
        
        for event in events:
            event_time = event.get('event_time', 0)
            
            if event_time > now:
                future_timestamps += 1
            elif (now - event_time) > max_age:
                old_timestamps += 1
            else:
                valid_timestamps += 1
        
        return {
            'valid_timestamps': valid_timestamps,
            'old_timestamps': old_timestamps,
            'future_timestamps': future_timestamps,
            'total_events': len(events)
        }
    
    def send_test_event(self, test_code: str = None) -> bool:
        """Envia um evento de teste para verificar a configuração"""
        if not test_code:
            test_code = f"TEST-{int(time.time())}"
        
        test_event = {
            "data": [{
                "event_name": "Purchase",
                "event_time": int(time.time()),
                "event_id": f"health_check_{int(time.time())}",
                "action_source": "website",
                "event_source_url": "https://example.com/health-check",
                "user_data": {
                    "em": ["healthcheck@example.com"],
                    "ph": ["+5511999999999"],
                    "client_ip_address": "192.168.1.1",
                    "client_user_agent": "CAPI Health Monitor v1.0"
                },
                "custom_data": {
                    "value": 99.99,
                    "currency": "BRL",
                    "content_ids": ["health_check_product"]
                }
            }],
            "test_event_code": test_code
        }
        
        try:
            response = requests.post(
                f"{self.base_url}/{self.pixel_id}/events",
                params={'access_token': self.access_token},
                headers={'Content-Type': 'application/json'},
                json=test_event
            )
            
            if response.status_code == 200:
                print(f"✅ Evento de teste enviado com sucesso!")
                print(f"🔍 Test Code: {test_code}")
                print(f"📋 Use este código no Events Manager > Test Events")
                return True
            else:
                print(f"❌ Erro ao enviar evento de teste: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Erro na requisição: {e}")
            return False
    
    def generate_health_report(self) -> Dict:
        """Gera relatório completo de saúde do CAPI"""
        print("🔍 Iniciando análise de saúde do CAPI...")
        
        # Verificar token
        if not self.check_token_validity():
            return {"error": "Token de acesso inválido"}
        
        print("✅ Token válido")
        
        # Buscar eventos recentes
        events = self.get_recent_events(500)
        if not events:
            return {"error": "Nenhum evento encontrado"}
        
        print(f"📊 Analisando {len(events)} eventos recentes...")
        
        # Análises
        dedup_analysis = self.analyze_deduplication(events)
        connection_analysis = self.analyze_connection_methods(events)
        latency_analysis = self.analyze_latency(events)
        timestamp_analysis = self.check_event_timestamps(events)
        
        # Calcular scores
        health_score = self.calculate_health_score(
            dedup_analysis, connection_analysis, latency_analysis, timestamp_analysis
        )
        
        return {
            'timestamp': datetime.now().isoformat(),
            'pixel_id': self.pixel_id,
            'health_score': health_score,
            'deduplication': dedup_analysis,
            'connection_methods': connection_analysis,
            'latency': latency_analysis,
            'timestamps': timestamp_analysis,
            'recommendations': self.generate_recommendations(
                dedup_analysis, connection_analysis, latency_analysis, timestamp_analysis
            )
        }
    
    def calculate_health_score(self, dedup: Dict, connection: Dict, 
                             latency: Dict, timestamps: Dict) -> Dict:
        """Calcula score de saúde geral"""
        scores = {}
        
        # Score de deduplicação (0-100)
        dedup_rate = dedup.get('deduplication_rate', 0)
        if dedup_rate >= 95:
            scores['deduplication'] = 100
        elif dedup_rate >= 90:
            scores['deduplication'] = 80
        elif dedup_rate >= 70:
            scores['deduplication'] = 60
        else:
            scores['deduplication'] = 30
        
        # Score de cobertura CAPI (0-100)
        capi_coverage = connection.get('capi_coverage', 0)
        if capi_coverage >= 85:
            scores['capi_coverage'] = 100
        elif capi_coverage >= 75:
            scores['capi_coverage'] = 80
        elif capi_coverage >= 50:
            scores['capi_coverage'] = 60
        else:
            scores['capi_coverage'] = 30
        
        # Score de latência (0-100)
        avg_latency_min = latency.get('avg_latency_minutes', 0)
        if avg_latency_min <= 5:
            scores['latency'] = 100
        elif avg_latency_min <= 10:
            scores['latency'] = 80
        elif avg_latency_min <= 20:
            scores['latency'] = 60
        else:
            scores['latency'] = 30
        
        # Score de timestamps (0-100)
        total = timestamps.get('total_events', 1)
        valid_ratio = timestamps.get('valid_timestamps', 0) / total
        scores['timestamps'] = int(valid_ratio * 100)
        
        # Score geral
        overall_score = sum(scores.values()) / len(scores)
        scores['overall'] = round(overall_score, 1)
        
        return scores
    
    def generate_recommendations(self, dedup: Dict, connection: Dict, 
                               latency: Dict, timestamps: Dict) -> List[str]:
        """Gera recomendações baseadas na análise"""
        recommendations = []
        
        # Deduplicação
        if dedup.get('deduplication_rate', 0) < 90:
            recommendations.append(
                "🔧 Implementar Event IDs únicos e consistentes entre Pixel e CAPI"
            )
        
        # Cobertura CAPI
        if connection.get('capi_coverage', 0) < 75:
            recommendations.append(
                "📈 Aumentar cobertura CAPI - implementar fallback para eventos perdidos pelo Pixel"
            )
        
        # Latência
        if latency.get('avg_latency_minutes', 0) > 20:
            recommendations.append(
                "⚡ Otimizar latência - enviar eventos em tempo real, não em batch"
            )
        
        # Timestamps
        invalid_ratio = (timestamps.get('old_timestamps', 0) + 
                        timestamps.get('future_timestamps', 0)) / timestamps.get('total_events', 1)
        if invalid_ratio > 0.1:
            recommendations.append(
                "🕐 Corrigir timestamps - eventos com mais de 7 dias ou no futuro"
            )
        
        # Recomendações gerais
        if connection.get('server_events', 0) == 0:
            recommendations.append(
                "🚨 CRÍTICO: Nenhum evento CAPI detectado - verificar implementação do servidor"
            )
        
        if not recommendations:
            recommendations.append("✅ Implementação está funcionando corretamente!")
        
        return recommendations
    
    def print_report(self, report: Dict):
        """Imprime relatório formatado"""
        if 'error' in report:
            print(f"❌ ERRO: {report['error']}")
            return
        
        print("\n" + "="*60)
        print("📊 RELATÓRIO DE SAÚDE - FACEBOOK CAPI")
        print("="*60)
        
        print(f"\n🎯 PIXEL ID: {report['pixel_id']}")
        print(f"📅 TIMESTAMP: {report['timestamp']}")
        
        # Health Scores
        scores = report['health_score']
        print(f"\n📈 HEALTH SCORES:")
        print(f"   Overall: {scores['overall']}/100")
        print(f"   Deduplicação: {scores['deduplication']}/100")
        print(f"   Cobertura CAPI: {scores['capi_coverage']}/100")
        print(f"   Latência: {scores['latency']}/100")
        print(f"   Timestamps: {scores['timestamps']}/100")
        
        # Deduplicação
        dedup = report['deduplication']
        print(f"\n🔄 DEDUPLICAÇÃO:")
        print(f"   Taxa: {dedup['deduplication_rate']:.1f}%")
        print(f"   Eventos totais: {dedup['total_events']}")
        print(f"   Eventos únicos: {dedup['unique_events']}")
        print(f"   Eventos duplicados: {dedup['duplicated_events']}")
        
        # Métodos de conexão
        conn = report['connection_methods']
        print(f"\n🌐 MÉTODOS DE CONEXÃO:")
        print(f"   Cobertura CAPI: {conn['capi_coverage']:.1f}%")
        print(f"   Browser: {conn['browser_events']}")
        print(f"   Server-Side: {conn['server_events']}")
        print(f"   Desconhecido: {conn['unknown_events']}")
        
        # Latência
        lat = report['latency']
        print(f"\n⚡ LATÊNCIA:")
        print(f"   Média: {lat['avg_latency_minutes']:.1f} minutos")
        print(f"   Máxima: {lat['max_latency_seconds']:.1f} segundos")
        print(f"   Eventos com latência: {lat['events_with_latency']}")
        
        # Timestamps
        ts = report['timestamps']
        print(f"\n🕐 TIMESTAMPS:")
        print(f"   Válidos: {ts['valid_timestamps']}")
        print(f"   Muito antigos (>7 dias): {ts['old_timestamps']}")
        print(f"   No futuro: {ts['future_timestamps']}")
        
        # Recomendações
        print(f"\n💡 RECOMENDAÇÕES:")
        for i, rec in enumerate(report['recommendations'], 1):
            print(f"   {i}. {rec}")
        
        print("\n" + "="*60)

def main():
    parser = argparse.ArgumentParser(description='Monitor de saúde Facebook CAPI')
    parser.add_argument('--pixel-id', required=True, help='ID do Pixel do Facebook')
    parser.add_argument('--access-token', required=True, help='Token de acesso da Graph API')
    parser.add_argument('--test-event', action='store_true', help='Enviar evento de teste')
    parser.add_argument('--test-code', help='Código para evento de teste')
    
    args = parser.parse_args()
    
    monitor = CAPIHealthMonitor(args.pixel_id, args.access_token)
    
    if args.test_event:
        monitor.send_test_event(args.test_code)
    else:
        report = monitor.generate_health_report()
        monitor.print_report(report)

if __name__ == "__main__":
    main()