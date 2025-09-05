import type { CloudflareEnv, CreateInvoiceRequest, FontType } from '@/types';
import { getAssetUrl } from '@/utils/url';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, type PDFFont, StandardFonts, rgb } from 'pdf-lib';

export class InvoicePDFGenerator {
  constructor(private env: CloudflareEnv) {}

  private async getGeistMonoFont(variant: FontType = 'regular'): Promise<ArrayBuffer> {
    try {
      const fontUrl = getAssetUrl(`/fonts/GeistMono-${variant}.ttf`, this.env);
      const fontResponse = await this.env.ASSETS.fetch(fontUrl);
      if (fontResponse.ok) {
        return await fontResponse.arrayBuffer();
      }
    } catch (_error) {
      console.log('Font loading failed, using fallback:', _error);
    }
    return new ArrayBuffer(0);
  }

  private async getFont(pdfDoc: PDFDocument, variant: FontType = 'regular'): Promise<PDFFont> {
    const fontBytes = await this.getGeistMonoFont(variant);
    pdfDoc.registerFontkit(fontkit);
    if (fontBytes.byteLength > 0) {
      return pdfDoc.embedFont(fontBytes);
    }
    // Fallback to standard font if custom font fails to load
    return pdfDoc.embedFont(StandardFonts.Helvetica);
  }

  private wrapText(text: string, maxWidth: number, font: PDFFont, fontSize: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);

      if (testWidth <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          lines.push(word);
        }
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }

  async generateInvoicePDF(request: CreateInvoiceRequest, invoiceId: string): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    const page = pdfDoc.addPage([595, 842]); // A4 size
    const { width, height } = page.getSize();

    // Load font
    const font = await this.getFont(pdfDoc, 'regular');
    const fontMedium = await this.getFont(pdfDoc, 'medium');
    const fontSemibold = await this.getFont(pdfDoc, 'semibold');

    // Design constants
    const margin = 40;
    const fontSize = 10;
    const lineHeight = 16;
    const headerFontSize = 24;
    const subHeaderFontSize = 11;
    const labelFontSize = 9;

    // Improved color hierarchy - more distinct levels
    const primary = rgb(0.2, 0.2, 0.2); // Main content - very dark gray
    const secondary = rgb(0.3, 0.3, 0.3); // Headers and labels - dark gray
    const tertiary = rgb(0.5, 0.5, 0.5); // Secondary info - medium gray
    const quaternary = rgb(0.6, 0.6, 0.6); // Subtle info - lighter gray
    const accent = rgb(0.85, 0.85, 0.85); // Borders and lines - light gray

    let yPosition = height - margin;

    // Header Decoration

    page.drawLine({
      start: { x: 0, y: height },
      end: { x: width, y: height },
      thickness: 8,
      color: rgb(98 / 255, 107 / 255, 241 / 255),
    });

    yPosition -= 4;

    // Header section
    page.drawText('Invoice', {
      x: margin,
      y: yPosition - headerFontSize / 2,
      size: headerFontSize,
      font: fontSemibold,
      color: primary,
    });

    page.drawText(`#${invoiceId}`, {
      x: width - margin - font.widthOfTextAtSize(`#${invoiceId}`, subHeaderFontSize),
      y: yPosition - headerFontSize / 2,
      size: subHeaderFontSize,
      font,
      color: quaternary,
    });

    yPosition -= 24;

    page.drawLine({
      start: { x: margin, y: yPosition },
      end: { x: margin + 40, y: yPosition },
      thickness: 2,
      color: quaternary,
    });

    yPosition -= 56;

    // Company information section
    const leftColumn = margin;
    const rightColumn = width / 2 + 40;
    const columnWidth = width / 2 - 40;
    const sectionStartY = yPosition;

    // Seller section
    page.drawText('FROM', {
      x: leftColumn,
      y: yPosition,
      size: labelFontSize,
      font,
      color: tertiary,
    });
    yPosition -= 18;

    const sellerLines: string[] = [];
    sellerLines.push(request.seller.name);

    const addressLines = this.wrapText(request.seller.address, columnWidth, font, fontSize);
    sellerLines.push(...addressLines);

    sellerLines.push(request.seller.email);
    if (request.seller.phone) {
      sellerLines.push(request.seller.phone);
    }

    for (const [index, line] of sellerLines.entries()) {
      page.drawText(line, {
        x: leftColumn,
        y: yPosition,
        size: fontSize,
        font: index === 0 ? fontSemibold : fontMedium,
        color: index === 0 ? primary : secondary,
      });
      yPosition -= lineHeight;
    }

    const sellerSectionHeight = (sellerLines.length + 1) * lineHeight + 18;
    yPosition = sectionStartY;

    // Buyer section
    page.drawText('TO', {
      x: rightColumn,
      y: yPosition,
      size: labelFontSize,
      font,
      color: tertiary,
    });
    yPosition -= 18;

    const buyerLines: string[] = [];
    buyerLines.push(request.buyer.name);

    const buyerAddressLines = this.wrapText(
      request.buyer.address,
      columnWidth - 40,
      font,
      fontSize
    );
    buyerLines.push(...buyerAddressLines);

    buyerLines.push(request.buyer.email);

    for (const [index, line] of buyerLines.entries()) {
      page.drawText(line, {
        x: rightColumn,
        y: yPosition,
        size: fontSize,
        font: index === 0 ? fontSemibold : fontMedium,
        color: index === 0 ? primary : secondary,
      });
      yPosition -= lineHeight;
    }

    const buyerSectionHeight = (buyerLines.length + 1) * lineHeight + 18;
    const maxSectionHeight = Math.max(sellerSectionHeight, buyerSectionHeight);
    yPosition = sectionStartY - maxSectionHeight - 40;

    page.drawText('Issue Date: ', {
      x: leftColumn,
      y: yPosition,
      size: fontSize,
      font,
      color: tertiary,
    });

    page.drawText(request.issueDate, {
      x: leftColumn + font.widthOfTextAtSize('Issue Date: ', fontSize),
      y: yPosition,
      size: fontSize,
      font: fontMedium,
      color: primary,
    });

    page.drawText('Due Date: ', {
      x: rightColumn,
      y: yPosition,
      size: fontSize,
      font,
      color: tertiary,
    });

    page.drawText(request.dueDate, {
      x: rightColumn + font.widthOfTextAtSize('Due Date: ', fontSize),
      y: yPosition,
      size: fontSize,
      font: fontMedium,
      color: primary,
    });

    yPosition -= 70;

    // Items table - properly aligned
    const tableStartY = yPosition;
    const tableWidth = width - margin * 2;

    // Better column distribution
    const colWidths = {
      description: Math.floor(tableWidth * 0.55), // 55% for description
      qty: Math.floor(tableWidth * 0.12), // 12% for quantity
      unit: Math.floor(tableWidth * 0.18), // 18% for unit price
      total: Math.floor(tableWidth * 0.15), // 15% for total
    };

    const colPositions = {
      description: margin,
      qty: margin + colWidths.description,
      unit: margin + colWidths.description + colWidths.qty,
      total: margin + colWidths.description + colWidths.qty + colWidths.unit,
    };

    // Table header - properly aligned
    page.drawText('Description', {
      x: colPositions.description,
      y: tableStartY,
      size: labelFontSize,
      font,
      color: tertiary,
    });

    page.drawText('Qty', {
      x:
        colPositions.qty + colWidths.qty / 2 - font.widthOfTextAtSize('Qty', labelFontSize) / 2 - 8,
      y: tableStartY,
      size: labelFontSize,
      font,
      color: tertiary,
    });

    page.drawText('Unit Price', {
      x: colPositions.unit + colWidths.unit - font.widthOfTextAtSize('Unit Price', labelFontSize),
      y: tableStartY,
      size: labelFontSize,
      font,
      color: tertiary,
    });

    page.drawText('Total', {
      x: colPositions.total + colWidths.total - font.widthOfTextAtSize('Total', labelFontSize),
      y: tableStartY,
      size: labelFontSize,
      font,
      color: tertiary,
    });

    // Header underline
    page.drawLine({
      start: { x: margin, y: tableStartY - 12 },
      end: { x: width - margin, y: tableStartY - 12 },
      thickness: 1,
      color: accent,
    });

    // Items
    let currentY = tableStartY - 36;
    let totalAmount = 0;

    for (const item of request.items) {
      const subtotal = item.qty * item.unit;
      const taxAmount = subtotal * (item.tax / 100);
      const itemTotal = subtotal + taxAmount;
      totalAmount += itemTotal;

      // Wrap description if needed
      const descriptionLines = this.wrapText(
        item.description,
        colWidths.description - 10,
        font,
        fontSize
      );

      // Draw description (potentially multiple lines)
      for (let i = 0; i < descriptionLines.length; i++) {
        page.drawText(descriptionLines[i], {
          x: colPositions.description,
          y: currentY - i * lineHeight,
          size: fontSize,
          font: fontMedium,
          color: primary,
        });
      }

      // Numbers aligned with first line of description
      const numberY = currentY;

      // Quantity (center-aligned)
      const qtyText = item.qty.toString();
      const qtyWidth = font.widthOfTextAtSize(qtyText, fontSize);
      page.drawText(qtyText, {
        x: colPositions.qty + colWidths.qty / 2 - qtyWidth / 2 - 8,
        y: numberY,
        size: fontSize,
        font: fontMedium,
        color: primary,
      });

      // Unit price (right-aligned)
      const unitText = `${request.currency} ${item.unit.toFixed(2)}`;
      const unitWidth = font.widthOfTextAtSize(unitText, fontSize);
      page.drawText(unitText, {
        x: colPositions.unit + colWidths.unit - unitWidth,
        y: numberY,
        size: fontSize,
        font: fontMedium,
        color: primary,
      });

      // Total (right-aligned)
      const totalText = `${request.currency} ${itemTotal.toFixed(2)}`;
      const totalWidth = font.widthOfTextAtSize(totalText, fontSize);
      page.drawText(totalText, {
        x: colPositions.total + colWidths.total - totalWidth,
        y: numberY,
        size: fontSize,
        font: fontMedium,
        color: primary,
      });

      // Move to next item
      currentY -= descriptionLines.length * lineHeight + 4;
    }

    // Total section - boxed with breakdown
    currentY -= 30;

    // Calculate box dimensions for total section
    const totalBoxWidth = 200;
    const totalBoxPadding = 16;
    const totalBoxX = width - margin - totalBoxWidth;

    // Calculate totals using actual values from request
    const subtotal = totalAmount; // Base total from items
    const taxRate = request.taxRate ?? 0;
    const discountRate = request.discountRate ?? 0;
    const taxAmount = subtotal * (taxRate / 100);
    const discountAmount = subtotal * (discountRate / 100);
    const finalTotal = subtotal + taxAmount - discountAmount;

    // Calculate box height based on content
    const totalBoxLineHeight = 18;
    const totalBoxLines = 4; // Subtotal, Tax, Discount, Total
    const totalBoxHeight = totalBoxLines * totalBoxLineHeight + totalBoxPadding * 2 + 10;

    // Draw box border (transparent background)
    page.drawRectangle({
      x: totalBoxX,
      y: currentY - totalBoxHeight,
      width: totalBoxWidth,
      height: totalBoxHeight + 4,
      borderColor: accent,
      borderWidth: 1,
    });

    let totalBoxY = currentY - totalBoxPadding - 4;

    // Subtotal
    page.drawText('Subtotal', {
      x: totalBoxX + totalBoxPadding,
      y: totalBoxY,
      size: fontSize,
      font,
      color: tertiary,
    });
    const subtotalText = `${request.currency} ${subtotal.toFixed(2)}`;
    page.drawText(subtotalText, {
      x:
        totalBoxX +
        totalBoxWidth -
        totalBoxPadding -
        font.widthOfTextAtSize(subtotalText, fontSize),
      y: totalBoxY,
      size: fontSize,
      font: fontMedium,
      color: primary,
    });
    totalBoxY -= totalBoxLineHeight;

    // Tax
    page.drawText(`Tax (${taxRate}%)`, {
      x: totalBoxX + totalBoxPadding,
      y: totalBoxY,
      size: fontSize,
      font,
      color: tertiary,
    });
    const taxText = `${request.currency} ${taxAmount.toFixed(2)}`;
    page.drawText(taxText, {
      x: totalBoxX + totalBoxWidth - totalBoxPadding - font.widthOfTextAtSize(taxText, fontSize),
      y: totalBoxY,
      size: fontSize,
      font: fontMedium,
      color: primary,
    });
    totalBoxY -= totalBoxLineHeight;

    // Discount
    page.drawText(`Discount (${discountRate}%)`, {
      x: totalBoxX + totalBoxPadding,
      y: totalBoxY,
      size: fontSize,
      font,
      color: tertiary,
    });
    const discountText = `-${request.currency} ${discountAmount.toFixed(2)}`;
    page.drawText(discountText, {
      x:
        totalBoxX +
        totalBoxWidth -
        totalBoxPadding -
        font.widthOfTextAtSize(discountText, fontSize),
      y: totalBoxY,
      size: fontSize,
      font: fontMedium,
      color: primary,
    });
    totalBoxY -= totalBoxLineHeight + 6;

    // Line above final total
    page.drawLine({
      start: { x: totalBoxX + totalBoxPadding, y: totalBoxY + 6 },
      end: { x: totalBoxX + totalBoxWidth - totalBoxPadding, y: totalBoxY + 6 },
      thickness: 1,
      color: accent,
    });

    // Final Total
    page.drawText('Total', {
      x: totalBoxX + totalBoxPadding,
      y: totalBoxY - 18,
      size: subHeaderFontSize,
      font: fontSemibold,
      color: secondary,
    });
    const finalTotalText = `${request.currency} ${finalTotal.toFixed(2)}`;
    page.drawText(finalTotalText, {
      x:
        totalBoxX +
        totalBoxWidth -
        totalBoxPadding -
        font.widthOfTextAtSize(finalTotalText, subHeaderFontSize),
      y: totalBoxY - 18,
      size: subHeaderFontSize,
      font: fontSemibold,
      color: primary,
    });

    // Store the total box start Y position for notes alignment
    const totalBoxStartY = currentY;

    // Update currentY to account for the total box
    currentY -= totalBoxHeight + 20;

    // Notes section - boxed and aligned with total box Y position
    if (request.notes) {
      // Calculate box dimensions
      const boxWidth = (width - margin * 2) * 0.4; // 40% of page width
      const boxPadding = 16;
      const boxMargin = margin;

      // Calculate wrapped text first to determine box height
      const notesLines = this.wrapText(request.notes, boxWidth - boxPadding * 2, font, fontSize);

      // Calculate dynamic box height based on content
      const headerHeight = labelFontSize + 8;
      const contentHeight = notesLines.length * lineHeight;
      const boxHeight = headerHeight + contentHeight + boxPadding * 2 - 4;

      // Use totalBoxStartY to align with total box
      const notesBoxY = totalBoxStartY;

      // Draw box border
      page.drawRectangle({
        x: boxMargin,
        y: notesBoxY - boxHeight + 4,
        width: boxWidth,
        height: boxHeight,
        borderColor: accent,
        borderWidth: 1,
      });

      // Draw "Notes" label
      page.drawText('Notes', {
        x: boxMargin + boxPadding,
        y: notesBoxY - boxPadding - labelFontSize + 6,
        size: labelFontSize,
        font,
        color: tertiary,
      });

      // Draw notes content with proper wrapping
      let notesY = notesBoxY - boxPadding - headerHeight;
      for (const line of notesLines) {
        page.drawText(line, {
          x: boxMargin + boxPadding,
          y: notesY - 4,
          size: fontSize,
          font: fontMedium,
          color: primary,
        });
        notesY -= lineHeight;
      }
    }

    // Payment instructions - absolutely positioned at bottom
    const bottomMargin = margin;
    const paymentY = bottomMargin;

    // Divider line
    page.drawLine({
      start: { x: margin, y: paymentY + 4 },
      end: { x: width - margin, y: paymentY + 4 },
      thickness: 1,
      color: accent,
    });

    // Payment instructions with smaller font size and center alignment
    const paymentFontSize = 8;
    const paymentText = `Please make payment by the due date. For questions about this invoice, contact ${request.seller.email}`;
    const paymentLines = this.wrapText(paymentText, width - margin * 2, font, paymentFontSize);

    let paymentCurrentY = paymentY - 15;
    for (const line of paymentLines) {
      page.drawText(line, {
        x: margin,
        y: paymentCurrentY,
        size: paymentFontSize,
        font,
        color: tertiary,
      });
      paymentCurrentY -= paymentFontSize + 2;
    }

    return await pdfDoc.save();
  }
}
