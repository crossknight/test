import { expect } from 'chai';
import forge from 'node-forge';
import uuidv4 from 'uuid/v4';

import { idp2Available } from '..';
import * as idpApi from '../../api/v2/idp';
import * as commonApi from '../../api/v2/common';
import { idp1EventEmitter, idp2EventEmitter } from '../../callback_server';
import * as db from '../../db';
import {
  createEventPromise,
  generateReferenceId,
  hash,
  wait,
  hashRequestMessageForConsent,
  createResponseSignature,
} from '../../utils';
import * as config from '../../config';

describe('IdP (idp2) create identity (providing accessor_id and custom request_message) as 2nd IdP', function() {
  let namespace;
  let identifier;
  const createIdentityRequestMessage =
    'Create identity consent request custom message ข้อความสำหรับขอสร้างตัวตนบนระบบ';
  const keypair = forge.pki.rsa.generateKeyPair(2048);
  const accessorPrivateKey = forge.pki.privateKeyToPem(keypair.privateKey);
  const accessorPublicKey = forge.pki.publicKeyToPem(keypair.publicKey);
  const accessorId = uuidv4();

  const referenceId = generateReferenceId();
  const idp1ReferenceId = generateReferenceId();

  const createIdentityRequestResultPromise = createEventPromise(); // 2nd IdP
  const accessorSignPromise = createEventPromise(); // 2nd IdP
  const incomingRequestPromise = createEventPromise(); // 1st IdP
  const responseResultPromise = createEventPromise(); // 1st IdP
  const createIdentityResultPromise = createEventPromise(); // 2nd IdP

  let requestId;
  let requestMessageHash;

  db.createIdentityReferences.push({
    referenceId,
    accessorPrivateKey,
  });

  before(function() {
    if (!idp2Available) {
      this.skip();
    }
    if (db.idp1Identities[0] == null) {
      throw new Error('No created identity to use');
    }

    namespace = db.idp1Identities[0].namespace;
    identifier = db.idp1Identities[0].identifier;

    idp1EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'incoming_request' &&
        callbackData.request_id === requestId
      ) {
        incomingRequestPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'response_result' &&
        callbackData.reference_id === idp1ReferenceId
      ) {
        responseResultPromise.resolve(callbackData);
      }
    });

    idp2EventEmitter.on('callback', function(callbackData) {
      if (
        callbackData.type === 'create_identity_request_result' &&
        callbackData.reference_id === referenceId
      ) {
        createIdentityRequestResultPromise.resolve(callbackData);
      } else if (
        callbackData.type === 'create_identity_result' &&
        callbackData.reference_id === referenceId
      ) {
        createIdentityResultPromise.resolve(callbackData);
      }
    });

    idp2EventEmitter.on('accessor_sign_callback', function(callbackData) {
      if (callbackData.reference_id === referenceId) {
        accessorSignPromise.resolve(callbackData);
      }
    });
  });

  it('should create identity request successfully', async function() {
    this.timeout(10000);
    const response = await idpApi.createIdentity('idp2', {
      reference_id: referenceId,
      callback_url: config.IDP2_CALLBACK_URL,
      namespace,
      identifier,
      accessor_type: 'RSA',
      accessor_public_key: accessorPublicKey,
      accessor_id: accessorId,
      ial: 2.3,
      request_message: createIdentityRequestMessage,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(202);
    expect(responseBody.request_id).to.be.a('string').that.is.not.empty;
    expect(responseBody.accessor_id).to.be.a('string').that.is.not.empty;

    requestId = responseBody.request_id;

    const createIdentityRequestResult = await createIdentityRequestResultPromise.promise;
    expect(createIdentityRequestResult).to.deep.include({
      reference_id: referenceId,
      request_id: requestId,
      exist: true,
      accessor_id: accessorId,
      success: true,
    });
    expect(createIdentityRequestResult.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = createIdentityRequestResult.creation_block_height.split(
      ':'
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
  });

  it('should receive accessor sign callback with correct data', async function() {
    this.timeout(15000);
    const sid = `${namespace}:${identifier}`;
    const sid_hash = hash(sid);

    const accessorSignParams = await accessorSignPromise.promise;
    expect(accessorSignParams).to.deep.equal({
      type: 'accessor_sign',
      node_id: 'idp2',
      reference_id: referenceId,
      accessor_id: accessorId,
      sid,
      sid_hash,
      hash_method: 'SHA256',
      key_type: 'RSA',
      sign_method: 'RSA-SHA256',
      padding: 'PKCS#1v1.5',
    });
  });

  it('2nd IdP should get request_id by reference_id while request is unfinished (not closed or timed out) successfully', async function() {
    this.timeout(10000);
    const response = await idpApi.getRequestIdByReferenceId('idp2', {
      reference_id: referenceId,
    });
    const responseBody = await response.json();
    expect(response.status).to.equal(200);
    expect(responseBody).to.deep.equal({
      request_id: requestId,
      accessor_id: accessorId,
    });
  });

  it('1st IdP should receive create identity request', async function() {
    this.timeout(15000);
    const incomingRequest = await incomingRequestPromise.promise;
    expect(incomingRequest).to.deep.include({
      mode: 3,
      request_id: requestId,
      namespace,
      identifier,
      request_message: createIdentityRequestMessage,
      request_message_hash: hashRequestMessageForConsent(
        createIdentityRequestMessage,
        incomingRequest.initial_salt,
        requestId
      ),
      requester_node_id: 'idp2',
      min_ial: 1.1,
      min_aal: 1,
      data_request_list: [],
    });
    expect(incomingRequest.creation_time).to.be.a('number');
    expect(incomingRequest.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = incomingRequest.creation_block_height.split(
      ':'
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    expect(incomingRequest.request_timeout).to.be.a('number');

    requestMessageHash = incomingRequest.request_message_hash;
  });

  it('1st IdP should create response (accept) successfully', async function() {
    this.timeout(10000);
    const identity = db.idp1Identities.find(
      identity =>
        identity.namespace === namespace && identity.identifier === identifier
    );

    const response = await idpApi.createResponse('idp1', {
      reference_id: idp1ReferenceId,
      callback_url: config.IDP1_CALLBACK_URL,
      request_id: requestId,
      namespace,
      identifier,
      ial: 2.3,
      aal: 3,
      secret: identity.accessors[0].secret,
      status: 'accept',
      signature: createResponseSignature(
        identity.accessors[0].accessorPrivateKey,
        requestMessageHash
      ),
      accessor_id: identity.accessors[0].accessorId,
    });
    expect(response.status).to.equal(202);

    const responseResult = await responseResultPromise.promise;
    expect(responseResult).to.deep.include({
      reference_id: idp1ReferenceId,
      request_id: requestId,
      success: true,
    });
  });

  it('Identity should be created successfully', async function() {
    this.timeout(15000);
    const createIdentityResult = await createIdentityResultPromise.promise;
    expect(createIdentityResult).to.deep.include({
      reference_id: referenceId,
      request_id: requestId,
      success: true,
    });
    expect(createIdentityResult.secret).to.be.a('string').that.is.not.empty;

    const secret = createIdentityResult.secret;

    const response = await commonApi.getRelevantIdpNodesBySid('idp2', {
      namespace,
      identifier,
    });
    const idpNodes = await response.json();
    const idpNode = idpNodes.find(idpNode => idpNode.node_id === 'idp2');
    expect(idpNode).to.exist;

    db.idp2Identities.push({
      namespace,
      identifier,
      accessors: [
        {
          accessorId,
          accessorPrivateKey,
          accessorPublicKey,
          secret,
        },
      ],
    });
  });

  it('Special request status for create identity should be completed and closed', async function() {
    this.timeout(10000);
    //wait for api close request
    await wait(3000);
    const response = await commonApi.getRequest('idp2', { requestId });
    const responseBody = await response.json();
    expect(responseBody).to.deep.include({
      request_id: requestId,
      min_idp: 1,
      min_aal: 1,
      min_ial: 1.1,
      request_timeout: 86400,
      data_request_list: [],
      closed: true,
      timed_out: false,
      mode: 3,
      status: 'completed',
      requester_node_id: 'idp2',
    });
    expect(responseBody.creation_block_height).to.be.a('string');
    const splittedCreationBlockHeight = responseBody.creation_block_height.split(
      ':'
    );
    expect(splittedCreationBlockHeight).to.have.lengthOf(2);
    expect(splittedCreationBlockHeight[0]).to.have.lengthOf.at.least(1);
    expect(splittedCreationBlockHeight[1]).to.have.lengthOf.at.least(1);
    await wait(3000); //wait for api clean up reference id
  });

  it('2nd IdP should get response status code 404 when get request_id by reference_id after request is finished (closed)', async function() {
    this.timeout(10000);
    const response = await idpApi.getRequestIdByReferenceId('idp2', {
      reference_id: referenceId,
    });
    expect(response.status).to.equal(404);
  });

  after(function() {
    idp1EventEmitter.removeAllListeners('callback');
    idp2EventEmitter.removeAllListeners('callback');
    idp2EventEmitter.removeAllListeners('accessor_sign_callback');
  });
});
