import { startCallbackServers, stopCallbackServers } from '../callback_server';
import {
  startCallbackServer as startDpkiCallbackServer,
  stopCallbackServer as stopDpkiCallbackServer,
} from '../callback_server/dpki';
import { isNodeAvailable } from '../helpers';
import * as config from '../config';

export let ndidAvailable;
export let rpAvailable;
export let idp1Available;
export let idp2Available;
export let as1Available;
export let as2Available;
export let proxy1Available;
export let proxy2Available;

async function checkForAvailableNodes() {
  const [
    _ndidAvailable,
    _rpAvailable,
    _idp1Available,
    _idp2Available,
    _as1Available,
    _as2Available,
    _proxy1Available,
    _proxy2Available,
  ] = await Promise.all([
    isNodeAvailable('ndid1'),
    isNodeAvailable('rp1'),
    isNodeAvailable('idp1'),
    isNodeAvailable('idp2'),
    isNodeAvailable('as1'),
    isNodeAvailable('as2'),
    isNodeAvailable('proxy1'),
    isNodeAvailable('proxy2'),
  ]);

  ndidAvailable = _ndidAvailable;
  rpAvailable = _rpAvailable;
  idp1Available = _idp1Available;
  idp2Available = _idp2Available;
  as1Available = _as1Available;
  as2Available = _as2Available;
  proxy1Available = _proxy1Available;
  proxy2Available = _proxy2Available;
}

describe('End-to-End NDID API test (API v2.1)', function() {
  before(async function() {
    this.timeout(600000);
    startCallbackServers();
    if (config.USE_EXTERNAL_CRYPTO_SERVICE) {
      startDpkiCallbackServer();
    }
    await checkForAvailableNodes();
    if (!rpAvailable || !idp1Available) {
      throw new Error('Could not connect to RP and IdP-1 nodes');
    }
  });

  require('./dpki_setup');
  require('./rp_setup');
  require('./idp_setup');
  require('./as_setup');
  require('./as_service_setup');
  require('./proxy_setup');
  require('./create_identity');
  // require('./ndid');
  // require('./dpki');
  // require('./add_accessor_method');
  require('./verify_identity');
  require('./data_request');
  // require('./create_request');
  // require('./idp_response');
  // require('./as_data_response');
  // require('./token');
  // require('./ndid_disable_enable');

  after(function() {
    stopCallbackServers();
    if (config.USE_EXTERNAL_CRYPTO_SERVICE) {
      stopDpkiCallbackServer();
    }
  });
});
