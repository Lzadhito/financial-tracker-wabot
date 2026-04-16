import type { WASocket, WAMessage } from '@whiskeysockets/baileys'
import { updateLedgerBudget, updateLedgerIncome, getLedgerById } from '../services/ledger.service'
import { sendTextReply } from '../whatsapp/sender'

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount)
}

export async function handleSetBudget(
  sock: WASocket,
  remoteJid: string,
  msg: WAMessage,
  ledgerId: string,
  amount: number
) {
  try {
    await updateLedgerBudget(ledgerId, amount)
    const ledger = await getLedgerById(ledgerId)

    const replyText =
      `✅ *Monthly budget set*\n\n` +
      `Budget: ${formatRupiah(amount)}${ledger?.monthlyIncome ? `\nIncome: ${formatRupiah(ledger.monthlyIncome)}` : ''}`

    await sendTextReply(sock, remoteJid, replyText, msg)
  } catch (error) {
    console.error('[Handler] Error setting budget:', error)
    await sendTextReply(
      sock,
      remoteJid,
      "Something went wrong. Please try again."
    )
  }
}

export async function handleSetIncome(
  sock: WASocket,
  remoteJid: string,
  msg: WAMessage,
  ledgerId: string,
  amount: number
) {
  try {
    await updateLedgerIncome(ledgerId, amount)
    const ledger = await getLedgerById(ledgerId)

    const replyText =
      `✅ *Monthly income set*\n\n` +
      `Income: ${formatRupiah(amount)}${ledger?.monthlyBudget ? `\nBudget: ${formatRupiah(ledger.monthlyBudget)}` : ''}`

    await sendTextReply(sock, remoteJid, replyText, msg)
  } catch (error) {
    console.error('[Handler] Error setting income:', error)
    await sendTextReply(
      sock,
      remoteJid,
      "Something went wrong. Please try again."
    )
  }
}
