// eslint-disable-next-line @typescript-eslint/no-var-requires
const circom_tester = require('circom_tester/wasm/tester')

import path from 'path'
import { sha256Pad } from '@zk-email/helpers/dist/shaHash'
import { bigIntToChunkedBytes } from '@zk-email/helpers/dist/binaryFormat'
import {
  Uint8ArrayToCharArray,
  bufferToHex,
} from '@zk-email/helpers/dist/binaryFormat'
import {
  convertBigIntToByteArray,
  decompressByteArray,
  extractPhoto,
  splitToWords,
  SELECTOR_ID,
  readData,
} from '@anon-aadhaar/core'
import { genData } from '../../core/test/utils'
import fs from 'fs'
import crypto from 'crypto'
import assert from 'assert'
import { buildPoseidon } from 'circomlibjs'

describe('Test QR Verify circuit', function () {
  this.timeout(0)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let circuit: any

  this.beforeAll(async () => {
    circuit = await circom_tester(
      path.join(__dirname, '../', 'src', 'aadhaar-verifier.circom'),
      {
        recompile: true,
        include: path.join(__dirname, '../node_modules'),
      },
    )
  })

  it('Test circuit with Sha256RSA signature', async () => {
    const signedData = 'Hello-20240116140412' // Add date from 6th index as this is expected in the message

    const data = await genData(signedData, 'SHA-256')

    const [paddedMsg, messageLen] = sha256Pad(
      Buffer.from(signedData, 'ascii'),
      512 * 3,
    )

    await circuit.calculateWitness({
      aadhaarData: Uint8ArrayToCharArray(paddedMsg),
      aadhaarDataLength: messageLen,
      signature: splitToWords(data[1], BigInt(64), BigInt(32)),
      pubKey: splitToWords(data[2], BigInt(64), BigInt(32)),
      signalHash: 0,
    })
  })

  it('Compute nullifier must correct', async () => {
    // load public key
    const pkData = fs.readFileSync(
      path.join(__dirname, '../assets', 'uidai_prod_cdup.cer'),
    )
    const pk = crypto.createPublicKey(pkData)

    // data on https://uidai.gov.in/en/ecosystem/authentication-devices-documents/qr-code-reader.html
    const QRData =
      '2374971804270526477833002468783965837992554564899874087591661303561346432389832047870524302186901344489362368642972767716416349990805756094923115719687656090691368051627957878187788907419297818953295185555346288172578594637886352753543271000481717080003254556962148594350559820352806251787713278744047402230989238559317351232114240089849934148895256488140236015024800731753594740948640957680138566468247224859669467819596919398964809164399637893729212452791889199675715949918925838319591794702333094022248132120531152523331442741730158840977243402215102904932650832502847295644794421419704633765033761284508863534321317394686768650111457751139630853448637215423705157211510636160227953566227527799608082928846103264491539001327407775670834868948113753614112563650255058316849200536533335903554984254814901522086937767458409075617572843449110393213525925388131214952874629655799772119820372255291052673056372346072235458198199995637720424196884145247220163810790179386390283738429482893152518286247124911446073389185062482901364671389605727763080854673156754021728522287806275420847159574631844674460263574901590412679291518508010087116598357407343835408554094619585212373168435612645646129147973594416508676872819776522537778717985070402222824965034768103900739105784663244748432502180989441389718131079445941981681118258324511923246198334046020123727749408128519721102477302359413240175102907322619462289965085963377744024233678337951462006962521823224880199210318367946130004264196899778609815012001799773327514133268825910089483612283510244566484854597156100473055413090101948456959122378865704840756793122956663218517626099291311352417342899623681483097817511136427210593032393600010728324905512596767095096153856032112835755780472808814199620390836980020899858288860556611564167406292139646289142056168261133256777093245980048335918156712295254776487472431445495668303900536289283098315798552328294391152828182614909451410115516297083658174657554955228963550255866282688308751041517464999930825273776417639569977754844191402927594739069037851707477839207593911886893016618794870530622356073909077832279869798641545167528509966656120623184120128052588408742941658045827255866966100249857968956536613250770326334844204927432961924987891433020671754710428050564671868464658436926086493709176888821257183419013229795869757265111599482263223604228286513011751601176504567030118257385997460972803240338899836840030438830725520798480181575861397469056536579877274090338750406459700907704031830137890544492015701251066934352867527112361743047684237105216779177819594030160887368311805926405114938744235859610328064947158936962470654636736991567663705830950312548447653861922078087824048793236971354828540758657075837209006713701763902429652486225300535997260665898927924843608750347193892239342462507130025307878412116604096773706728162016134101751551184021079984480254041743057914746472840768175369369852937574401874295943063507273467384747124843744395375119899278823903202010381949145094804675442110869084589592876721655764753871572233276245590041302887094585204427900634246823674277680009401177473636685542700515621164233992970974893989913447733956146698563285998205950467321954304'

    const QRDataBigInt = BigInt(QRData)

    const QRDataBytes = convertBigIntToByteArray(QRDataBigInt)
    const QRDataDecode = decompressByteArray(QRDataBytes)

    const signatureBytes = QRDataDecode.slice(
      QRDataDecode.length - 256,
      QRDataDecode.length,
    )

    const signedData = QRDataDecode.slice(0, QRDataDecode.length - 256)

    const [paddedMsg, messageLen] = sha256Pad(signedData, 512 * 3)

    const pubKey = BigInt(
      '0x' +
        bufferToHex(
          Buffer.from(pk.export({ format: 'jwk' }).n as string, 'base64url'),
        ),
    )

    const signature = BigInt(
      '0x' + bufferToHex(Buffer.from(signatureBytes)).toString(),
    )

    const witness = await circuit.calculateWitness({
      aadhaarData: Uint8ArrayToCharArray(paddedMsg),
      aadhaarDataLength: messageLen,
      signature: splitToWords(signature, BigInt(64), BigInt(32)),
      pubKey: splitToWords(pubKey, BigInt(64), BigInt(32)),
      signalHash: 4,
    })

    const poseidon: any = await buildPoseidon()

    const { photo } = extractPhoto(Array.from(signedData))

    let basicData: number[] = []
    for (const id of [
      SELECTOR_ID.name,
      SELECTOR_ID.dob,
      SELECTOR_ID.gender,
      SELECTOR_ID.pinCode,
    ].sort((x, y) => x - y)) {
      basicData = basicData.concat([
        255,
        ...readData(Array.from(signedData), id),
      ])
    }

    let basicHash = 0
    for (let i = 0; i < basicData.length; ++i) {
      basicHash = poseidon([basicHash, BigInt(basicData[i])])
    }

    let photoHash = 0
    for (let i = 0; i < photo.length; ++i) {
      photoHash = poseidon([photoHash, BigInt(photo[i])])
    }

    const four_digit = paddedMsg.slice(2, 6)
    const userNullifier = poseidon([...four_digit, photoHash])
    const identityNullifier = poseidon([...four_digit, basicHash])

    assert(witness[1] == BigInt(poseidon.F.toString(identityNullifier)))
    assert(witness[2] == BigInt(poseidon.F.toString(userNullifier)))
  })

  it('should output timestamp of when data is generated', async () => {
    // load public key
    const pkData = fs.readFileSync(
      path.join(__dirname, '../assets', 'uidai_prod_cdup.cer'),
    )
    const pk = crypto.createPublicKey(pkData)

    // data on https://uidai.gov.in/en/ecosystem/authentication-devices-documents/qr-code-reader.html
    const qrData =
      '2374971804270526477833002468783965837992554564899874087591661303561346432389832047870524302186901344489362368642972767716416349990805756094923115719687656090691368051627957878187788907419297818953295185555346288172578594637886352753543271000481717080003254556962148594350559820352806251787713278744047402230989238559317351232114240089849934148895256488140236015024800731753594740948640957680138566468247224859669467819596919398964809164399637893729212452791889199675715949918925838319591794702333094022248132120531152523331442741730158840977243402215102904932650832502847295644794421419704633765033761284508863534321317394686768650111457751139630853448637215423705157211510636160227953566227527799608082928846103264491539001327407775670834868948113753614112563650255058316849200536533335903554984254814901522086937767458409075617572843449110393213525925388131214952874629655799772119820372255291052673056372346072235458198199995637720424196884145247220163810790179386390283738429482893152518286247124911446073389185062482901364671389605727763080854673156754021728522287806275420847159574631844674460263574901590412679291518508010087116598357407343835408554094619585212373168435612645646129147973594416508676872819776522537778717985070402222824965034768103900739105784663244748432502180989441389718131079445941981681118258324511923246198334046020123727749408128519721102477302359413240175102907322619462289965085963377744024233678337951462006962521823224880199210318367946130004264196899778609815012001799773327514133268825910089483612283510244566484854597156100473055413090101948456959122378865704840756793122956663218517626099291311352417342899623681483097817511136427210593032393600010728324905512596767095096153856032112835755780472808814199620390836980020899858288860556611564167406292139646289142056168261133256777093245980048335918156712295254776487472431445495668303900536289283098315798552328294391152828182614909451410115516297083658174657554955228963550255866282688308751041517464999930825273776417639569977754844191402927594739069037851707477839207593911886893016618794870530622356073909077832279869798641545167528509966656120623184120128052588408742941658045827255866966100249857968956536613250770326334844204927432961924987891433020671754710428050564671868464658436926086493709176888821257183419013229795869757265111599482263223604228286513011751601176504567030118257385997460972803240338899836840030438830725520798480181575861397469056536579877274090338750406459700907704031830137890544492015701251066934352867527112361743047684237105216779177819594030160887368311805926405114938744235859610328064947158936962470654636736991567663705830950312548447653861922078087824048793236971354828540758657075837209006713701763902429652486225300535997260665898927924843608750347193892239342462507130025307878412116604096773706728162016134101751551184021079984480254041743057914746472840768175369369852937574401874295943063507273467384747124843744395375119899278823903202010381949145094804675442110869084589592876721655764753871572233276245590041302887094585204427900634246823674277680009401177473636685542700515621164233992970974893989913447733956146698563285998205950467321954304'

    const qrDataBytes = convertBigIntToByteArray(BigInt(qrData))
    const decodedData = decompressByteArray(qrDataBytes)

    const signatureBytes = decodedData.slice(
      decodedData.length - 256,
      decodedData.length,
    )

    const signedData = decodedData.slice(0, decodedData.length - 256)
    const [paddedMsg, messageLen] = sha256Pad(signedData, 512 * 3)

    const pubKey = BigInt(
      '0x' +
        bufferToHex(
          Buffer.from(pk.export({ format: 'jwk' }).n as string, 'base64url'),
        ),
    )

    const signature = BigInt(
      '0x' + bufferToHex(Buffer.from(signatureBytes)).toString(),
    )

    const witness = await circuit.calculateWitness({
      aadhaarData: Uint8ArrayToCharArray(paddedMsg),
      aadhaarDataLength: messageLen,
      signature: splitToWords(signature, BigInt(64), BigInt(32)),
      pubKey: splitToWords(pubKey, BigInt(64), BigInt(32)),
      signalHash: 0,
    })

    // This is the time in the QR data above is 20190308114407437.
    // 2019-03-08 11:44:07.437 rounded down to nearest hour is 2019-03-08 11:00:00.000
    // Converting this IST to UTC gives 2019-03-08T05:30:00.000Z
    const expectedTimestamp = Math.floor(
      new Date('2019-03-08T05:30:00.000Z').getTime() / 1000,
    )

    assert(witness[3] === BigInt(expectedTimestamp))
  })

  it('should output hash of pubkey', async () => {
    const signedData = 'Hello-20240116140412'

    const data = await genData(signedData, 'SHA-256')

    const [paddedMsg, messageLen] = sha256Pad(
      Buffer.from(signedData, 'ascii'),
      512 * 3,
    )

    const witness = await circuit.calculateWitness({
      aadhaarData: Uint8ArrayToCharArray(paddedMsg),
      aadhaarDataLength: messageLen,
      signature: splitToWords(data[1], BigInt(64), BigInt(32)),
      modulus: splitToWords(data[2], BigInt(64), BigInt(32)),
      signalHash: 0,
    })

    // Calculate the Poseidon hash with pubkey chunked to 9*242 like in circuit
    const poseidon = await buildPoseidon()
    const pubkeyChunked = bigIntToChunkedBytes(data[2], 128, 16)
    const hash = poseidon(pubkeyChunked)

    assert(witness[4] === BigInt(poseidon.F.toObject(hash)))
  })
})
