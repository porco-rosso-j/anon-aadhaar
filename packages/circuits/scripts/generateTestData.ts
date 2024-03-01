import {
  convertBigIntToByteArray,
  decompressByteArray,
} from '@anon-aadhaar/core'
import pako from 'pako'
import crypto from 'crypto'
import fs from 'fs'

const data =
  '2374971804270526477833002468783965837992554564899874087591661303561346432389832047870524302186901344489362368642972767716416349990805756094923115719687656090691368051627957878187788907419297818953295185555346288172578594637886352753543271000481717080003254556962148594350559820352806251787713278744047402230989238559317351232114240089849934148895256488140236015024800731753594740948640957680138566468247224859669467819596919398964809164399637893729212452791889199675715949918925838319591794702333094022248132120531152523331442741730158840977243402215102904932650832502847295644794421419704633765033761284508863534321317394686768650111457751139630853448637215423705157211510636160227953566227527799608082928846103264491539001327407775670834868948113753614112563650255058316849200536533335903554984254814901522086937767458409075617572843449110393213525925388131214952874629655799772119820372255291052673056372346072235458198199995637720424196884145247220163810790179386390283738429482893152518286247124911446073389185062482901364671389605727763080854673156754021728522287806275420847159574631844674460263574901590412679291518508010087116598357407343835408554094619585212373168435612645646129147973594416508676872819776522537778717985070402222824965034768103900739105784663244748432502180989441389718131079445941981681118258324511923246198334046020123727749408128519721102477302359413240175102907322619462289965085963377744024233678337951462006962521823224880199210318367946130004264196899778609815012001799773327514133268825910089483612283510244566484854597156100473055413090101948456959122378865704840756793122956663218517626099291311352417342899623681483097817511136427210593032393600010728324905512596767095096153856032112835755780472808814199620390836980020899858288860556611564167406292139646289142056168261133256777093245980048335918156712295254776487472431445495668303900536289283098315798552328294391152828182614909451410115516297083658174657554955228963550255866282688308751041517464999930825273776417639569977754844191402927594739069037851707477839207593911886893016618794870530622356073909077832279869798641545167528509966656120623184120128052588408742941658045827255866966100249857968956536613250770326334844204927432961924987891433020671754710428050564671868464658436926086493709176888821257183419013229795869757265111599482263223604228286513011751601176504567030118257385997460972803240338899836840030438830725520798480181575861397469056536579877274090338750406459700907704031830137890544492015701251066934352867527112361743047684237105216779177819594030160887368311805926405114938744235859610328064947158936962470654636736991567663705830950312548447653861922078087824048793236971354828540758657075837209006713701763902429652486225300535997260665898927924843608750347193892239342462507130025307878412116604096773706728162016134101751551184021079984480254041743057914746472840768175369369852937574401874295943063507273467384747124843744395375119899278823903202010381949145094804675442110869084589592876721655764753871572233276245590041302887094585204427900634246823674277680009401177473636685542700515621164233992970974893989913447733956146698563285998205950467321954304'

const addPrefixAnd4Digits = (signedData: Uint8Array) => {
  const allDataParsed: number[][] = []
  let countDelimiter = 0
  let temp: number[] = []
  let endIndex = 0
  for (let i = 0; i < signedData.length; i++) {
    if (countDelimiter < 16) {
      if (signedData[i] !== 255) {
        temp.push(signedData[i])
      } else {
        countDelimiter += 1
        allDataParsed.push(temp)
        temp = []
      }
    } else {
      endIndex = i
      break
    }
  }

  const versionSpecifier = new Uint8Array([86, 50, 255]) // 'V2' in ASCII followed by 255
  const number1234 = new Uint8Array([49, 50, 51, 52]) // '1234' in ASCII
  const beforeInsertion = new Uint8Array(signedData.slice(0, endIndex))
  const afterInsertion = new Uint8Array(signedData.slice(endIndex))

  // Combine all parts together
  const newData = new Uint8Array(
    versionSpecifier.length +
      beforeInsertion.length +
      number1234.length +
      afterInsertion.length,
  )
  newData.set(versionSpecifier, 0)
  newData.set(beforeInsertion, versionSpecifier.length)
  newData.set(number1234, versionSpecifier.length + beforeInsertion.length)
  newData.set(
    afterInsertion,
    versionSpecifier.length + beforeInsertion.length + number1234.length,
  )

  return newData
}

export function compressByteArray(byteArray: Uint8Array): Uint8Array {
  const compressedArray = pako.deflate(byteArray)
  return new Uint8Array(compressedArray)
}

export function convertByteArrayToBigInt(byteArray: Uint8Array): bigint {
  let result = BigInt(0)
  for (let i = 0; i < byteArray.length; i++) {
    result = result * BigInt(256) + BigInt(byteArray[i])
  }
  return result
}

const rawDataToCompressedQR = (data: Uint8Array) => {
  const compressedDataBytes = compressByteArray(data)
  const compressedBigInt = convertByteArrayToBigInt(compressedDataBytes)
  return compressedBigInt
}

const signNewTestData = (newSignedData: Uint8Array) => {
  const privateKey = fs.readFileSync('../assets/testPrivateKey.pem', {
    encoding: 'utf8',
  })

  const bufferData = Buffer.from(newSignedData)

  const sign = crypto.createSign('sha256')
  sign.update(bufferData)
  sign.end()

  const signature = sign.sign({
    key: privateKey,
  })

  return signature
}

const main = (data: string) => {
  const qrDataBytes = convertBigIntToByteArray(BigInt(data))
  const decodedData = decompressByteArray(qrDataBytes)

  // Turning test data V1 into V2
  // Adding the version specifier prefix and the last 4 digits of phone number
  const signedData = addPrefixAnd4Digits(
    decodedData.slice(0, decodedData.length - 256),
  )

  const signature = signNewTestData(signedData)

  const tempData = Buffer.concat([signedData, signature])
  const newStringData = rawDataToCompressedQR(tempData)
  console.log(newStringData.toString())
}

main(data)
