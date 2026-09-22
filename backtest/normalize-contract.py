"""Convert Binance 1000PEPE klines to per-PEPE price and quantity units.

Quote-volume columns and timestamps are unchanged. This is a unit conversion,
not an extra asset or a reconstructed price series.
Source: https://www.binance.com/en/support/announcement/detail/41993e3389654713946bcb6b9b032eaf
"""
import csv
from decimal import Decimal
from pathlib import Path
import sys


def normalize(row):
    result = list(row)
    for column in (1, 2, 3, 4):
        result[column] = str(Decimal(result[column]) / 1000)
    for column in (5, 9):
        result[column] = str(Decimal(result[column]) * 1000)
    return result


if __name__ == '__main__':
    path = Path(sys.argv[1])
    with path.open(newline='') as source:
        rows = [normalize(row) for row in csv.reader(source) if row and row[0].isdigit()]
    with path.open('w', newline='') as target:
        csv.writer(target, lineterminator='\n').writerows(rows)
