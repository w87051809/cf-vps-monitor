/**
 * NodeTable - sortable public node status table.
 */
import React, { useMemo, useState } from 'react';
import { Badge, Box, Flex, Table, Text } from '@radix-ui/themes';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import UsageBar from './UsageBar';
import Flag from './Flag';
import { formatBytes, formatPercent, formatSpeed, formatUptime } from '../utils/format';
import { getOSImage, getOSName } from '../utils/osIcon';
import { ClientInfo, LiveDataMap } from '../types';

interface NodeTableProps {
  nodes: ClientInfo[];
  liveData: LiveDataMap;
}

type SortKey = 'manual' | 'name' | 'os' | 'status' | 'cpu' | 'ram' | 'disk' | 'network' | 'traffic';
type SortDir = 'asc' | 'desc';

function getSortOrder(node: ClientInfo) {
  return typeof node.sort_order === 'number' && Number.isFinite(node.sort_order)
    ? node.sort_order
    : Number.MAX_SAFE_INTEGER;
}

export default function NodeTable({ nodes, liveData }: NodeTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('manual');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const onlineSet = useMemo(() => new Set(liveData?.online || []), [liveData?.online]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
      return;
    }

    setSortKey(key);
    setSortDir('asc');
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ChevronsUpDown size={12} style={{ opacity: 0.35 }} />;
    return sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  };

  const sortedNodes = useMemo(() => {
    return [...nodes].sort((a, b) => {
      const aOnline = onlineSet.has(a.uuid);
      const bOnline = onlineSet.has(b.uuid);
      const aLive = liveData?.data?.[a.uuid];
      const bLive = liveData?.data?.[b.uuid];

      let cmp = 0;
      switch (sortKey) {
        case 'manual':
          cmp = getSortOrder(a) - getSortOrder(b);
          break;
        case 'name':
          cmp = (a.name || '').localeCompare(b.name || '');
          break;
        case 'os':
          cmp = (a.os || '').localeCompare(b.os || '');
          break;
        case 'status':
          cmp = Number(bOnline) - Number(aOnline);
          break;
        case 'cpu':
          cmp = (aLive?.cpu || 0) - (bLive?.cpu || 0);
          break;
        case 'ram':
          cmp = formatPercent(aLive?.ram || 0, a.mem_total) - formatPercent(bLive?.ram || 0, b.mem_total);
          break;
        case 'disk':
          cmp = formatPercent(aLive?.disk || 0, a.disk_total) - formatPercent(bLive?.disk || 0, b.disk_total);
          break;
        case 'network':
          cmp = ((aLive?.net_in || 0) + (aLive?.net_out || 0)) - ((bLive?.net_in || 0) + (bLive?.net_out || 0));
          break;
        case 'traffic':
          cmp = ((aLive?.net_total_up || 0) + (aLive?.net_total_down || 0)) - ((bLive?.net_total_up || 0) + (bLive?.net_total_down || 0));
          break;
      }

      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [nodes, sortKey, sortDir, liveData, onlineSet]);

  const SortHeader = ({
    column,
    children,
    style,
  }: {
    column: SortKey;
    children: React.ReactNode;
    style?: React.CSSProperties;
  }) => (
    <Table.ColumnHeaderCell
      style={{ cursor: 'pointer', whiteSpace: 'nowrap', ...style }}
      onClick={() => handleSort(column)}
    >
      <Flex align="center" gap="1">
        {children}
        <SortIcon column={column} />
      </Flex>
    </Table.ColumnHeaderCell>
  );

  return (
    <Box className="node-table-scroll">
      <Table.Root
        className="node-table-root"
        variant="surface"
        size="1"
        style={{ width: '100%', minWidth: 1206, tableLayout: 'fixed' }}
      >
        <Table.Header>
          <Table.Row>
            <SortHeader column="name" style={{ width: 180 }}>名称</SortHeader>
            <SortHeader column="os" style={{ width: 132 }}>系统</SortHeader>
            <SortHeader column="status" style={{ width: 136 }}>状态</SortHeader>
            <SortHeader column="cpu" style={{ width: 150 }}>CPU</SortHeader>
            <SortHeader column="ram" style={{ width: 150 }}>内存</SortHeader>
            <SortHeader column="disk" style={{ width: 150 }}>硬盘</SortHeader>
            <SortHeader column="network" style={{ width: 142 }}>网络</SortHeader>
            <SortHeader column="traffic" style={{ width: 166 }}>流量</SortHeader>
          </Table.Row>
        </Table.Header>

        <Table.Body>
          {sortedNodes.map((node) => {
            const isOnline = onlineSet.has(node.uuid);
            const live = liveData?.data?.[node.uuid];
            const cpuVal = live?.cpu || 0;
            const ramPct = formatPercent(live?.ram || 0, node.mem_total);
            const diskPct = formatPercent(live?.disk || 0, node.disk_total);
            const uptimeLabel = formatUptime(live?.uptime || 0);

            return (
              <Table.Row key={node.uuid}>
                  <Table.Cell>
                    <Flex className="node-table-name-cell" align="center" gap="2">
                      <Flag region={node.region} size={16} />
                      <Box style={{ minWidth: 0 }}>
                        <Text weight="bold" size="2" truncate>{node.name}</Text>
                        {node.group && <Text size="1" color="gray" truncate>{node.group}</Text>}
                      </Box>
                    </Flex>
                  </Table.Cell>
                  <Table.Cell>
                    <Flex align="center" gap="2" style={{ minWidth: 0 }}>
                      <img src={getOSImage(node.os)} alt="" style={{ width: 18, height: 18 }} />
                      <Text size="2" truncate style={{ maxWidth: 82 }}>{getOSName(node.os)}</Text>
                    </Flex>
                  </Table.Cell>
                  <Table.Cell className="node-table-status-cell">
                    <Flex className="node-table-status-stack" gap="1" align="center">
                      <Badge color={isOnline ? 'green' : 'red'} variant="soft" size="1">
                        {isOnline ? '在线' : '离线'}
                      </Badge>
                      {isOnline && (
                        <Text size="1" color="gray" className="node-uptime-nowrap" title={uptimeLabel}>
                          {uptimeLabel}
                        </Text>
                      )}
                    </Flex>
                  </Table.Cell>
                  <Table.Cell>
                    <Box className="node-table-resource-cell">
                      <UsageBar value={cpuVal} showLabel={false} />
                      <Text size="1" color="gray">{cpuVal.toFixed(1)}%</Text>
                    </Box>
                  </Table.Cell>
                  <Table.Cell>
                    <Box className="node-table-resource-cell">
                      <UsageBar value={ramPct} showLabel={false} />
                      <Text size="1" color="gray">{ramPct.toFixed(1)}%</Text>
                    </Box>
                  </Table.Cell>
                  <Table.Cell>
                    <Box className="node-table-resource-cell">
                      <UsageBar value={diskPct} showLabel={false} />
                      <Text size="1" color="gray">{diskPct.toFixed(1)}%</Text>
                    </Box>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="2" style={{ whiteSpace: 'nowrap' }}>
                      ↑ {formatSpeed(live?.net_out || 0)} ↓ {formatSpeed(live?.net_in || 0)}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="2" style={{ whiteSpace: 'nowrap' }}>
                      ↑ {formatBytes(live?.net_total_up || 0)} ↓ {formatBytes(live?.net_total_down || 0)}
                    </Text>
                  </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Root>
    </Box>
  );
}
