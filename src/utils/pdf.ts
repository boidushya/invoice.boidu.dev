import type { CloudflareEnv, CreateInvoiceRequest } from '@/types';
import { getAssetUrl } from '@/utils/url';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, type PDFFont, StandardFonts, rgb } from 'pdf-lib';

export class InvoicePDFGenerator {
  constructor(private env: CloudflareEnv) {}

  private async getGeistMonoFont(): Promise<ArrayBuffer> {
    try {
      const fontUrl = getAssetUrl('/fonts/GeistMono.ttf', this.env);
      const fontResponse = await this.env.ASSETS.fetch(fontUrl);
      if (fontResponse.ok) {
        return await fontResponse.arrayBuffer();
      }
    } catch (_error) {
      console.log('Font loading failed, using fallback:', _error);
    }
    return new ArrayBuffer(0);
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

  async generateInvoicePDF(request: CreateInvoiceRequest, invoiceId: number): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    const page = pdfDoc.addPage([595, 842]); // A4 size
    const { width, height } = page.getSize();

    // Load font
    let font: PDFFont;
    try {
      const fontBytes = await this.getGeistMonoFont();
      if (fontBytes.byteLength > 0) {
        font = await pdfDoc.embedFont(fontBytes);
      } else {
        font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      }
    } catch (_error) {
      font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    }

    // Design constants
    const margin = 40;
    const fontSize = 10;
    const lineHeight = 16;
    const headerFontSize = 24;
    const subHeaderFontSize = 11;
    const labelFontSize = 9;

    // Improved color hierarchy - more distinct levels
    const primary = rgb(0, 0, 0); // Main content - pure black
    const secondary = rgb(0.15, 0.15, 0.15); // Headers and labels - very dark gray
    const tertiary = rgb(0.4, 0.4, 0.4); // Secondary info - medium gray
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
    page.drawText('INVOICE', {
      x: margin,
      y: yPosition - headerFontSize / 2,
      size: headerFontSize,
      font,
      color: primary,
    });

    page.drawText(`#${invoiceId}`, {
      x: width - margin - font.widthOfTextAtSize(`#${invoiceId}`, subHeaderFontSize),
      y: yPosition - subHeaderFontSize / 2,
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

    yPosition -= 36;

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

    for (const line of sellerLines) {
      page.drawText(line, {
        x: leftColumn,
        y: yPosition,
        size: fontSize,
        font,
        color: primary,
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

    for (const line of buyerLines) {
      page.drawText(line, {
        x: rightColumn,
        y: yPosition,
        size: fontSize,
        font,
        color: primary,
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
      font,
      color: secondary,
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
      font,
      color: secondary,
    });

    yPosition -= 50;

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
      x: colPositions.qty + colWidths.qty / 2 - font.widthOfTextAtSize('Qty', labelFontSize) / 2,
      y: tableStartY,
      size: labelFontSize,
      font,
      color: tertiary,
    });

    page.drawText('Unit Price', {
      x:
        colPositions.unit +
        colWidths.unit / 2 -
        font.widthOfTextAtSize('Unit Price', labelFontSize) / 2,
      y: tableStartY,
      size: labelFontSize,
      font,
      color: tertiary,
    });

    page.drawText('Total', {
      x:
        colPositions.total +
        colWidths.total / 2 -
        font.widthOfTextAtSize('Total', labelFontSize) / 2,
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
          font,
          color: primary,
        });
      }

      // Numbers aligned with first line of description
      const numberY = currentY;

      // Quantity (center-aligned)
      const qtyText = item.qty.toString();
      const qtyWidth = font.widthOfTextAtSize(qtyText, fontSize);
      page.drawText(qtyText, {
        x: colPositions.qty + colWidths.qty / 2 - qtyWidth / 2,
        y: numberY,
        size: fontSize,
        font,
        color: primary,
      });

      // Unit price (right-aligned)
      const unitText = `${request.currency} ${item.unit.toFixed(2)}`;
      const unitWidth = font.widthOfTextAtSize(unitText, fontSize);
      page.drawText(unitText, {
        x: colPositions.unit + colWidths.unit - unitWidth - 5,
        y: numberY,
        size: fontSize,
        font,
        color: primary,
      });

      // Total (right-aligned)
      const totalText = `${request.currency} ${itemTotal.toFixed(2)}`;
      const totalWidth = font.widthOfTextAtSize(totalText, fontSize);
      page.drawText(totalText, {
        x: colPositions.total + colWidths.total - totalWidth - 5,
        y: numberY,
        size: fontSize,
        font,
        color: primary,
      });

      // Move to next item
      currentY -= descriptionLines.length * lineHeight + 4;
    }

    // Total section
    currentY -= 0;

    // Line above total
    page.drawLine({
      start: { x: colPositions.unit, y: currentY },
      end: { x: width - margin, y: currentY },
      thickness: 1,
      color: accent,
    });

    currentY -= 24;

    // Total
    page.drawText('TOTAL', {
      x: colPositions.unit,
      y: currentY,
      size: subHeaderFontSize,
      font,
      color: secondary,
    });

    const totalText = `${request.currency} ${totalAmount.toFixed(2)}`;
    const totalTextWidth = font.widthOfTextAtSize(totalText, subHeaderFontSize);
    page.drawText(totalText, {
      x: colPositions.total + colWidths.total - totalTextWidth - 5,
      y: currentY,
      size: subHeaderFontSize,
      font,
      color: primary,
    });

    // Notes section - boxed and half width
    if (request.notes) {
      currentY -= 40;

      // Calculate box dimensions
      const boxWidth = (width - margin * 2) / 2; // Half width
      const boxPadding = 12;
      const boxMargin = margin;

      // Calculate wrapped text first to determine box height
      const notesLines = this.wrapText(request.notes, boxWidth - boxPadding * 2, font, fontSize);

      // Calculate dynamic box height based on content
      const headerHeight = labelFontSize + 8;
      const contentHeight = notesLines.length * lineHeight;
      const boxHeight = headerHeight + contentHeight + boxPadding * 2;

      // Draw box background
      page.drawRectangle({
        x: boxMargin,
        y: currentY - boxHeight,
        width: boxWidth,
        height: boxHeight,
        color: rgb(0.99, 0.99, 0.99), // Very light gray background
      });

      // Draw box border
      page.drawRectangle({
        x: boxMargin,
        y: currentY - boxHeight,
        width: boxWidth,
        height: boxHeight,
        borderColor: accent,
        borderWidth: 1,
      });

      // Draw "Notes" label
      page.drawText('Notes', {
        x: boxMargin + boxPadding,
        y: currentY - boxPadding - labelFontSize,
        size: labelFontSize,
        font,
        color: tertiary,
      });

      currentY -= 12;

      // Draw notes content with proper wrapping
      let notesY = currentY - boxPadding - headerHeight;
      for (const line of notesLines) {
        page.drawText(line, {
          x: boxMargin + boxPadding,
          y: notesY,
          size: fontSize,
          font,
          color: primary,
        });
        notesY -= lineHeight;
      }

      // Update currentY to account for the box
      currentY -= boxHeight + 10;
    }

    return await pdfDoc.save();
  }
}
