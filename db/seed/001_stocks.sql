INSERT INTO stock (symbol, company_name, exchange, sector) VALUES
    ('AAPL',  'Apple Inc.',                  'NASDAQ', 'Technology'),
    ('MSFT',  'Microsoft Corporation',       'NASDAQ', 'Technology'),
    ('NVDA',  'NVIDIA Corporation',          'NASDAQ', 'Technology'),
    ('AMD',   'Advanced Micro Devices, Inc.', 'NASDAQ', 'Technology'),
    ('TSLA',  'Tesla, Inc.',                 'NASDAQ', 'Consumer Cyclical'),
    ('AMZN',  'Amazon.com, Inc.',            'NASDAQ', 'Consumer Cyclical'),
    ('GOOGL', 'Alphabet Inc.',               'NASDAQ', 'Communication Services'),
    ('META',  'Meta Platforms, Inc.',        'NASDAQ', 'Communication Services'),
    ('NFLX',  'Netflix, Inc.',               'NASDAQ', 'Communication Services'),
    ('DIS',   'The Walt Disney Company',     'NYSE',   'Communication Services'),
    ('JPM',   'JPMorgan Chase & Co.',        'NYSE',   'Financial Services'),
    ('BA',    'The Boeing Company',          'NYSE',   'Industrials')
ON CONFLICT (symbol) DO NOTHING;
