import fetch from 'node-fetch';
import { nodeIdMappingAddress } from '../config';

export function getApiAddressUrl(nodeId) {
  if (nodeIdMappingAddress && nodeIdMappingAddress[nodeId]) {
    return nodeIdMappingAddress[nodeId];
  }
  if (nodeId === 'rp1') {
    return 'http://localhost:8200';
  } else if (nodeId === 'rp2') {
    return 'http://localhost:8201';
  } else if (nodeId === 'idp1') {
    return 'http://localhost:8100';
  } else if (nodeId === 'idp2') {
    return 'http://localhost:8101';
  } else if (nodeId === 'idp3') {
    return 'http://localhost:8102';
  } else if (nodeId === 'as1') {
    return 'http://localhost:8300';
  } else if (nodeId === 'as2') {
    return 'http://localhost:8301';
  } else if (nodeId === 'ndid1') {
    return 'http://localhost:8080';
  } else if (nodeId === 'proxy1') {
    return 'http://localhost:8400';
  } else if (nodeId === 'proxy2') {
    return 'http://localhost:8401';
  } else {
    throw new Error('Unsupported Node ID');
  }
}

export async function httpGet(url) {
  return fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });
}

export async function httpPost(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

export async function httpDelte(url) {
  return fetch(url, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
    },
  });
}
