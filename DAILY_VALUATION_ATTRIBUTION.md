# 일별 평가액 기여도 및 실제 투자수익률 검증 기준

- MCP 도구 `portfolio_daily_valuation_attribution`은 NH 개인 WSL에 저장된 **기존 비공개 일별 보유증권 스냅샷**과 NAV 후보만 읽습니다. 증권사 추가 호출, 원본 변경, 주문/환전은 없습니다.
- 종목수량이 변하지 않은 종목에 한해 두 **관측일 사이** 평가액 변화액을 기여도로 제시합니다. 종목이 추가/매도/수량변경되면 해당 종목의 가격효과는 추정하지 않으며 `quantity_changed_or_added_or_removed_symbols`로 구분합니다.
- 주말 스냅샷은 `observation_on_weekend=true`로 명시합니다. 국내 거래소 휴장일을 완전히 검증하지 않았으므로 `exchange_session_calendar_verified=false`를 유지합니다. 미국 주식 가치는 환율·직전 미국장 종가 영향이 반영될 수 있습니다.
- NAV 후보가 같은 날짜로 존재하더라도 `verified_full_nav=false`이며, `reported_net_assets_krw`의 전후 변화는 자금의 외부 유입과 구분되지 않으므로 투자수익률이 아닙니다.
- 수익률 검증 조건: (1) 정확한 전일·당일 전체 순자산(예수금·미결제·대출 반영) 및 회계 정의 확인, (2) 완전한 외부 납입·출금 원장과 이체 출처 검증, (3) 같은 평가 기준과 시간 정렬, (4) 필요한 경우 외부 흐름 시점과 환율 및 배당 기록 대조.
- 위 조건이 충족되기 전까지 `actual_investment_profit_krw=null`, `actual_investment_return_pct=null`이 유지됩니다. **임의로 0원 또는 0%를 채우지 않습니다.**
- KIS 계좌와의 합산 비교 시 양쪽 기록 날짜가 일치하고 각각 증권 평가액 무결성이 확인된 경우에만 합산 **증권 평가액 증감**을 계산합니다. 통합 순자산 수익률을 자동 산출하지 않습니다.
