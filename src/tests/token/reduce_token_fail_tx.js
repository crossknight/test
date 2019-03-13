import { expect } from 'chai';
import forge from 'node-forge';

import * as ndidApi from '../../api/v2/ndid';
import * as commonApi from '../../api/v2/common';
import * as debugApi from '../../api/v2/debug';
import { wait } from '../../utils';
import { ndidAvailable, idp1Available } from '..';

describe('Reduce node token when tx fail test', function() {
  const keypair = forge.pki.rsa.generateKeyPair(2048);
  const accessorPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);
  const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);
  let nodeTokenBeforeTest = 0;
  before(async function() {
    if (!ndidAvailable || !idp1Available) {
      this.skip();
    }
    const response = await commonApi.getToken('idp1');
    const responseBody = await response.json();
    nodeTokenBeforeTest = responseBody.amount;
  });

  it('NDID should set node token for idp1 successfully', async function() {
    this.timeout(10000);

    const response = await ndidApi.setNodeToken('ndid1', {
      node_id: 'idp1',
      amount: 5,
    });
    expect(response.status).to.equal(204);
    await wait(2000);
  });

  it('Should idp1 use debug api for making fail tx in CheckTx successfully (invalid key format)', async function() {
    this.timeout(30000);
    // flood 5 fail tx in checkTx
    for (let i of [1, 2, 3, 4, 5]) {
      await debugApi.transact('idp1', {
        nodeId: 'idp1',
        fnName: 'AddAccessorMethod',
        request_id: 'request_id test',
        accessor_group_id: 'accessor_group_id test',
        accessor_type: 'accessor_type test',
        accessor_id: 'accessor_id test',
        accessor_public_key: 'Invalid key format',
      });
    }
    await wait(3000);
  });

  it('idp1 should not be reduced token when making fail tx in CheckTx', async function() {
    this.timeout(10000);
    const responseGetToken = await commonApi.getToken('idp1');
    const responseBodyGetToken = await responseGetToken.json();
    expect(responseGetToken.status).to.equal(200);
    expect(responseBodyGetToken.amount).to.equal(5);
  });

  it('Should idp1 use debug api for making fail tx in DeliveryTx successfully', async function() {
    this.timeout(30000);
    // flood 5 fail tx in DeliverTx
    for (let i of [1, 2, 3, 4, 5]) {
      await debugApi.transact('idp1', {
        nodeId: 'idp1',
        fnName: 'AddAccessorMethod',
        request_id: 'request_id test',
        accessor_group_id: 'accessor_group_id test',
        accessor_type: 'accessor_type test',
        accessor_id: 'accessor_id test',
        accessor_public_key: accessorPublicKey,
      });
    }
    await wait(3000);
  });

  it('idp1 should be reduced token when making fail tx in DeliverTx and idp1 should be out of token', async function() {
    this.timeout(10000);
    const responseGetToken = await commonApi.getToken('idp1');
    const responseBodyGetToken = await responseGetToken.json();
    expect(responseGetToken.status).to.equal(200);
    expect(responseBodyGetToken.amount).to.equal(0);
  });

  after(async function() {
    this.timeout(10000);
    const response = await ndidApi.setNodeToken('ndid1', {
      node_id: 'idp1',
      amount: nodeTokenBeforeTest,
    });
    expect(response.status).to.equal(204);
    await wait(2000);
  });
});
