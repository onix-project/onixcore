'use strict';

var _ = require('lodash');
var BN = require('./crypto/bn');
var bu = require('./util/buffer');
var BufferReader = require('./encoding/bufferreader');
var BufferWriter = require('./encoding/bufferwriter');
var Hash = require('./crypto/hash');
var ju = require('./util/js');

/**
 * Instantiate a BlockHeader from a Buffer, JSON object, or Object with
 * the properties of the BlockHeader
 *
 * @param {*} - A Buffer, JSON string, or Object
 * @returns {BlockHeader} - An instance of block header
 * @constructor
 */
var BlockHeader = function BlockHeader(arg) {
  if (!(this instanceof BlockHeader)) {
    return new BlockHeader(arg);
  }
  _.extend(this, BlockHeader._from(arg));
  return this;
};

/**
 * @param {*} - A Buffer, JSON string or Object
 * @returns {Object} - An object representing block header data
 * @throws {TypeError} - If the argument was not recognized
 * @private
 */
BlockHeader._from = function _from(arg) {
  var info = {};
  if (bu.isBuffer(arg)) {
    info = BlockHeader._fromBufferReader(BufferReader(arg));
  } else if (ju.isValidJson(arg)) {
    info = BlockHeader._fromJSON(arg);
  } else if (_.isObject(arg)) {
    info = {
      version: arg.version,
      prevblockidbuf: arg.prevblockidbuf,
      merklerootbuf: arg.merklerootbuf,
      time: arg.time,
      bits: arg.bits,
      nonce: arg.nonce
    };
  } else {
    throw new TypeError('Unrecognized argument for BlockHeader');
  }
  return info;
};

/**
 * @param {String|Object} - A JSON string or object
 * @returns {Object} - An object representing block header data
 * @private
 */
BlockHeader._fromJSON = function _fromJSON(data) {
  if (ju.isValidJson(data)) {
    data = JSON.parse(data);
  }
  var info = {
    version: data.version,
    prevblockidbuf: new Buffer(data.prevblockidbuf, 'hex'),
    merklerootbuf: new Buffer(data.merklerootbuf, 'hex'),
    time: data.time,
    bits: data.bits,
    nonce: data.nonce
  };
  return info;
};

/**
 * @param {String|Object} - A JSON string or object
 * @returns {BlockHeader} - An instance of block header
 */
BlockHeader.fromJSON = function fromJSON(json) {
  var info = BlockHeader._fromJSON(json);
  return new BlockHeader(info);
};

/**
 * @param {Binary} - Raw block binary data or buffer
 * @returns {BlockHeader} - An instance of block header
 */
BlockHeader.fromRawBlock = function fromRawBlock(data) {
  if (!bu.isBuffer(data)) {
    data = new Buffer(data, 'binary');
  }
  var br = BufferReader(data);
  br.pos = BlockHeader.Constants.START_OF_HEADER;
  var info = BlockHeader._fromBufferReader(br);
  return new BlockHeader(info);
};

/**
 * @param {Buffer} - A buffer of the block header
 * @returns {BlockHeader} - An instance of block header
 */
BlockHeader.fromBuffer = function fromBuffer(buf) {
  var info = BlockHeader._fromBufferReader(BufferReader(buf));
  return new BlockHeader(info);
};

/**
 * @param {BufferReader} - A BufferReader of the block header
 * @returns {Object} - An object representing block header data
 * @private
 */
BlockHeader._fromBufferReader = function _fromBufferReader(br) {
  var info = {
    version: br.readUInt32LE(),
    prevblockidbuf: br.read(32),
    merklerootbuf: br.read(32),
    time: br.readUInt32LE(),
    bits: br.readUInt32LE(),
    nonce: br.readUInt32LE()
  };
  return info;
};

/**
 * @param {BufferReader} - A BufferReader of the block header
 * @returns {BlockHeader} - An instance of block header
 */
BlockHeader.fromBufferReader = function fromBufferReader(br) {
  var info = BlockHeader._fromBufferReader(br);
  return new BlockHeader(info);
};

/**
 * @returns {Object} - A JSON object of the BlockHeader
 */
BlockHeader.prototype.toJSON = function toJSON() {
  return {
    version: this.version,
    prevblockidbuf: this.prevblockidbuf.toString('hex'),
    merklerootbuf: this.merklerootbuf.toString('hex'),
    time: this.time,
    bits: this.bits,
    nonce: this.nonce
  };
};

/**
 * @returns {Buffer} - A Buffer of the BlockHeader
 */
BlockHeader.prototype.toBuffer = function toBuffer() {
  return this.toBufferWriter().concat();
};

/**
 * @param {BufferWriter} - An existing instance BufferWriter
 * @returns {BufferWriter} - An instance of BufferWriter representation of the BlockHeader
 */
BlockHeader.prototype.toBufferWriter = function toBufferWriter(bw) {
  if (!bw) {
    bw = new BufferWriter();
  }
  bw.writeUInt32LE(this.version);
  bw.write(this.prevblockidbuf);
  bw.write(this.merklerootbuf);
  bw.writeUInt32LE(this.time);
  bw.writeUInt32LE(this.bits);
  bw.writeUInt32LE(this.nonce);
  return bw;
};

/**
 * @link https://en.bitcoin.it/wiki/Difficulty
 * @returns {BN} - An instance of BN with the decoded difficulty bits
 */
BlockHeader.prototype.getTargetDifficulty = function getTargetDifficulty(info) {
  var target = BN(this.bits & 0xffffff);
  var mov = 8 * ((this.bits >>> 24) - 3);
  while (mov-- > 0) {
    target = target.mul(2);
  }
  return target;
};

/**
 * @returns {Buffer} - The little endian hash buffer of the header
 */
BlockHeader.prototype.hash = function hash() {
  var buf = this.toBuffer();
  return Hash.sha256sha256(buf);
};

/**
 * @returns {Buffer} - The big endian hash buffer of the header
 */
BlockHeader.prototype.id = function id() {
  return BufferReader(this.hash()).reverse().read();
};

/**
 * @returns {Boolean} - If timestamp is not too far in the future
 */
BlockHeader.prototype.validTimestamp = function validTimestamp() {
  var currentTime = Math.round(new Date().getTime() / 1000);
  if (this.time > currentTime + BlockHeader.Constants.MAX_TIME_OFFSET) {
    return false;
  }
  return true;
};

/**
 * @returns {Boolean} - If the proof-of-work hash satisfies the target difficulty
 */
BlockHeader.prototype.validProofOfWork = function validProofOfWork() {
  var hash = this.id().toString('hex');
  var pow = new BN(hash, 'hex');
  var target = this.getTargetDifficulty();
  if (pow.cmp(target) > 0) {
    return false;
  }
  return true;
};

/**
 * @returns {String} - A string formated for the console
 */
BlockHeader.prototype.inspect = function inspect() {
  return '<BlockHeader ' + this.id().toString('hex') + '>';
};

BlockHeader.Constants = {
  START_OF_HEADER: 8, // Start buffer position in raw block data
  MAX_TIME_OFFSET: 2 * 60 * 60, // The max a timestamp can be in the future
  LARGEST_HASH: new BN('10000000000000000000000000000000000000000000000000000000000000000', 'hex')
};

module.exports = BlockHeader;