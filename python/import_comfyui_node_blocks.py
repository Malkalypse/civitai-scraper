#!/usr/bin/env python3
"""
Import ComfyUI node definitions from block-formatted text into MySQL.

Expected block format (multiple blocks supported):

Type: "Lying Sigma Sampler"
Inputs: ["sampler"]
Widgets: ["dishonesty_factor", "start_percent", "end_percent"]
Outputs: ["SAMPLER"]

Notes:
- "Widgets" accepts both "Widgets:" and "Widgets".
- Values can be quoted strings or JSON/Python-style string arrays.
- Works with either `node_types` or `nodes` as the node table.
"""

from __future__ import annotations

import argparse
import ast
import re
from dataclasses import dataclass
from typing import Dict, List, Sequence

import pymysql
from pymysql.connections import Connection
from pymysql.cursors import Cursor


@dataclass
class NodeBlock:
    """Parsed node block payload."""

    node_type: str
    inputs: List[str]
    widgets: List[str]
    outputs: List[str]


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description='Import ComfyUI node blocks into comfyui_nodes database.'
    )
    parser.add_argument('--file', required=True, help='Path to text file containing node blocks.')
    parser.add_argument('--host', default='localhost', help='MySQL host. Default: localhost')
    parser.add_argument('--port', type=int, default=3306, help='MySQL port. Default: 3306')
    parser.add_argument('--user', default='root', help='MySQL user. Default: root')
    parser.add_argument('--password', default='', help='MySQL password. Default: empty')
    parser.add_argument('--database', default='comfyui_nodes', help='MySQL database. Default: comfyui_nodes')
    parser.add_argument('--dry-run', action='store_true', help='Parse and validate without writing to DB.')
    return parser.parse_args()


def read_text_file(file_path: str) -> str:
    """Read UTF-8 text file and return content."""
    with open(file_path, 'r', encoding='utf-8') as file_obj:
        return file_obj.read()


def split_blocks(raw_text: str) -> List[List[str]]:
    """Split text into blocks by detecting each new Type line."""
    lines = raw_text.splitlines()
    blocks: List[List[str]] = []
    current: List[str] = []

    type_pattern = re.compile(r'^\s*type\s*:', re.IGNORECASE)

    for line in lines:
        if type_pattern.match(line) and current:
            blocks.append(current)
            current = [line]
            continue

        if not current and line.strip() == '':
            continue

        if not current and not type_pattern.match(line):
            # Ignore preamble noise before first block.
            continue

        current.append(line)

    if current:
        blocks.append(current)

    return blocks


def parse_list_value(raw_value: str) -> List[str]:
    """Parse list literal and normalize to list[str]."""
    cleaned = raw_value.strip().rstrip(',')
    if cleaned == '':
        return []

    parsed = None
    try:
        parsed = ast.literal_eval(cleaned)
    except (SyntaxError, ValueError):
        pass

    if parsed is None:
        # Fallback for forgiving parsing: [a, b] -> ["a", "b"]
        if cleaned.startswith('[') and cleaned.endswith(']'):
            inner = cleaned[1:-1].strip()
            if inner == '':
                return []
            return [part.strip().strip('"\'') for part in inner.split(',') if part.strip()]
        return [cleaned.strip('"\'')]

    if isinstance(parsed, (list, tuple)):
        return [str(item).strip() for item in parsed if str(item).strip() != '']

    return [str(parsed).strip()]


def parse_type_value(raw_value: str) -> str:
    """Parse type value and normalize to non-empty string."""
    cleaned = raw_value.strip().rstrip(',')
    if cleaned == '':
        return ''

    try:
        parsed = ast.literal_eval(cleaned)
        return str(parsed).strip()
    except (SyntaxError, ValueError):
        return cleaned.strip('"\'').strip()


def parse_block(lines: Sequence[str]) -> NodeBlock:
    """Parse one Type/Inputs/Widgets/Outputs block."""
    patterns = {
        'type': re.compile(r'^\s*type\s*:\s*(.*)$', re.IGNORECASE),
        'inputs': re.compile(r'^\s*inputs\s*:\s*(.*)$', re.IGNORECASE),
        'widgets': re.compile(r'^\s*widgets\s*:?[\s]*(.*)$', re.IGNORECASE),
        'outputs': re.compile(r'^\s*outputs\s*:\s*(.*)$', re.IGNORECASE),
    }

    payload: Dict[str, str] = {
        'type': '',
        'inputs': '[]',
        'widgets': '[]',
        'outputs': '[]',
    }

    for line in lines:
        for key, pattern in patterns.items():
            match = pattern.match(line)
            if match:
                payload[key] = match.group(1).strip()
                break

    node_type = parse_type_value(payload['type'])
    if node_type == '':
        raise ValueError(f'Block missing Type value: {" | ".join(lines)}')

    return NodeBlock(
        node_type=node_type,
        inputs=parse_list_value(payload['inputs']),
        widgets=parse_list_value(payload['widgets']),
        outputs=parse_list_value(payload['outputs']),
    )


def parse_blocks(raw_text: str) -> List[NodeBlock]:
    """Parse all blocks from raw text."""
    blocks_raw = split_blocks(raw_text)
    parsed_blocks: List[NodeBlock] = []

    for block_lines in blocks_raw:
        block = parse_block(block_lines)
        parsed_blocks.append(block)

    return parsed_blocks


def table_exists(cursor: Cursor, table_name: str) -> bool:
    """Check whether a table exists in current database."""
    cursor.execute('SHOW TABLES LIKE %s', (table_name,))
    return cursor.fetchone() is not None


def get_node_table_info(cursor: Cursor) -> tuple[str, str]:
    """Resolve node table and display/type column names."""
    node_table = 'node_types' if table_exists(cursor, 'node_types') else 'nodes'

    cursor.execute(f'DESCRIBE `{node_table}`')
    columns = [row[0] for row in cursor.fetchall()]
    if 'type' in columns:
        return node_table, 'type'
    if 'name' in columns:
        return node_table, 'name'

    raise RuntimeError(f'Could not find type/name column in table `{node_table}`.')


def get_or_create_node_id(cursor: Cursor, node_table: str, type_column: str, node_type: str) -> int:
    """Fetch existing node ID or insert new node type."""
    cursor.execute(
        f'SELECT id FROM `{node_table}` WHERE `{type_column}` = %s LIMIT 1',
        (node_type,),
    )
    row = cursor.fetchone()
    if row:
        return int(row[0])

    cursor.execute(
        f'INSERT INTO `{node_table}` (`{type_column}`) VALUES (%s)',
        (node_type,),
    )
    return int(cursor.lastrowid)


def get_or_create_label_id(cursor: Cursor, label: str) -> int:
    """Fetch existing label ID or insert new label."""
    cursor.execute('SELECT id FROM `port_labels` WHERE `label` = %s LIMIT 1', (label,))
    row = cursor.fetchone()
    if row:
        return int(row[0])

    cursor.execute('INSERT INTO `port_labels` (`label`) VALUES (%s)', (label,))
    return int(cursor.lastrowid)


def ensure_port_association(
    cursor: Cursor,
    node_id: int,
    label_id: int,
    port_type: str,
    port_index: int,
) -> bool:
    """Ensure one ports row exists; return True if inserted, False if already existed."""
    cursor.execute(
        'INSERT IGNORE INTO `ports` (`node_id`, `label_id`, `port_type`, `port_index`) VALUES (%s, %s, %s, %s)',
        (node_id, label_id, port_type, port_index),
    )
    return cursor.rowcount > 0


def iter_ports(block: NodeBlock):
    """Yield normalized (port_type, labels_list) tuples in required order."""
    yield 'input', block.inputs
    yield 'widget', block.widgets
    yield 'output', block.outputs


def import_blocks(connection: Connection, blocks: Sequence[NodeBlock]) -> Dict[str, int]:
    """Import parsed blocks into DB and return summary counters."""
    summary = {
        'blocks': len(blocks),
        'nodes_created': 0,
        'labels_created': 0,
        'ports_created': 0,
        'ports_existing': 0,
    }

    with connection.cursor() as cursor:
        node_table, type_column = get_node_table_info(cursor)

        for block in blocks:
            cursor.execute(
                f'SELECT id FROM `{node_table}` WHERE `{type_column}` = %s LIMIT 1',
                (block.node_type,),
            )
            existing_node = cursor.fetchone()
            if existing_node:
                node_id = int(existing_node[0])
            else:
                node_id = get_or_create_node_id(cursor, node_table, type_column, block.node_type)
                summary['nodes_created'] += 1

            for port_type, labels in iter_ports(block):
                for port_index, label in enumerate(labels):
                    label_value = str(label).strip()
                    if label_value == '':
                        continue

                    cursor.execute(
                        'SELECT id FROM `port_labels` WHERE `label` = %s LIMIT 1',
                        (label_value,),
                    )
                    existing_label = cursor.fetchone()
                    if existing_label:
                        label_id = int(existing_label[0])
                    else:
                        label_id = get_or_create_label_id(cursor, label_value)
                        summary['labels_created'] += 1

                    inserted = ensure_port_association(
                        cursor=cursor,
                        node_id=node_id,
                        label_id=label_id,
                        port_type=port_type,
                        port_index=port_index,
                    )
                    if inserted:
                        summary['ports_created'] += 1
                    else:
                        summary['ports_existing'] += 1

    return summary


def main() -> None:
    """Program entry point."""
    args = parse_args()
    raw_text = read_text_file(args.file)
    blocks = parse_blocks(raw_text)

    if len(blocks) == 0:
        raise SystemExit('No valid Type blocks found in input file.')

    print(f'Parsed {len(blocks)} block(s).')

    if args.dry_run:
        for idx, block in enumerate(blocks, start=1):
            print(
                f'[{idx}] Type={block.node_type!r} '
                f'inputs={len(block.inputs)} widgets={len(block.widgets)} outputs={len(block.outputs)}'
            )
        print('Dry run complete. No database changes were made.')
        return

    connection = pymysql.connect(
        host=args.host,
        port=args.port,
        user=args.user,
        password=args.password,
        database=args.database,
        charset='utf8mb4',
        autocommit=False,
    )

    try:
        summary = import_blocks(connection, blocks)
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()

    print('Import complete:')
    print(f"  blocks processed : {summary['blocks']}")
    print(f"  nodes created    : {summary['nodes_created']}")
    print(f"  labels created   : {summary['labels_created']}")
    print(f"  ports created    : {summary['ports_created']}")
    print(f"  ports existing   : {summary['ports_existing']}")


if __name__ == '__main__':
    main()
