// Support collant Excel : distribue un bloc de texte (colonnes séparées par des
// tabulations, lignes par des retours à la ligne) copié depuis un tableur sur
// plusieurs cellules d'une grille, à partir de la cellule ciblée.
export function handlePasteFill({ event, rows, columns, rowIndex, colIndex, applyCell }) {
  const text = event.clipboardData?.getData('text')
  if (!text || (!text.includes('\t') && !text.includes('\n'))) {
    return false
  }
  event.preventDefault()

  const matrix = text
    .replace(/\r/g, '')
    .split('\n')
    .filter((line, i, arr) => !(i === arr.length - 1 && line === ''))
    .map((line) => line.split('\t'))

  matrix.forEach((line, r) => {
    const targetRow = rows[rowIndex + r]
    if (targetRow === undefined) return
    line.forEach((value, c) => {
      const targetColumn = columns[colIndex + c]
      if (targetColumn === undefined) return
      applyCell(targetRow, targetColumn, value.trim())
    })
  })

  return true
}
