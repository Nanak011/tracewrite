const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { query } = require("../../db");
const { Document, Packer, Paragraph, TextRun } = require("docx");
const mammoth = require("mammoth");

/**
 * Convert HTML content to a basic DOCX file
 */
async function htmlToDocx(html) {
  // Extract text from HTML paragraphs
  const paragraphs = [];
  const paragraphRegex = /<p[^>]*>(.*?)<\/p>/gi;
  let match;
  
  while ((match = paragraphRegex.exec(html)) !== null) {
    const text = match[1]
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .trim();
    
    if (text) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun(text)],
        })
      );
    }
  }

  // Create document
  const doc = new Document({
    sections: [{
      children: paragraphs.length > 0 ? paragraphs : [
        new Paragraph({ children: [new TextRun("Empty document")] })
      ],
    }],
  });

  // Generate buffer
  return await Packer.toBuffer(doc);
}

/**
 * Live formatting with socket updates
 */
async function formatLive(req, res) {
  try {
    const projectId = Number(req.params.projectId);
    const userId = req.session.user.id;
    const options = req.body.options || {};

    console.log('Live formatting for project:', projectId);

    // Get project and document
    const projectRows = await query("SELECT title FROM projects WHERE id = ?", [projectId]);
    if (!projectRows || projectRows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const docRows = await query("SELECT content FROM project_documents WHERE project_id = ?", [projectId]);
    if (!docRows || docRows.length === 0) {
      return res.status(404).json({ error: "Document not found" });
    }

    // Get socket IO instance
    const io = req.app.get('io');
    const userRoom = `user_${userId}`;
    
    if (io) {
      io.to(userRoom).emit('format_progress', {
        stage: 'extraction',
        message: 'Converting document to DOCX format...',
        progress: 20,
      });
    }

    // Start Python formatter process
    const pythonScript = path.join(__dirname, "..", "..", "..", "nlp", "new_formatter.py");
    
    // Create temp directory
    const tempDir = path.join(__dirname, "..", "..", "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const timestamp = Date.now();
    const inputFile = path.join(tempDir, `input_${projectId}_${timestamp}.docx`);
    const outputFile = path.join(tempDir, `output_${projectId}_${timestamp}.docx`);
    
    // Convert HTML to DOCX
    try {
      const docxBuffer = await htmlToDocx(docRows[0].content);
      fs.writeFileSync(inputFile, docxBuffer);
      
      if (io) {
        io.to(userRoom).emit('format_progress', {
          stage: 'conversion',
          message: 'Document converted successfully',
          progress: 30,
        });
      }
    } catch (convError) {
      console.error('Conversion error:', convError);
      if (io) {
        io.to(userRoom).emit('format_error', {
          error: 'Failed to convert document',
          details: convError.message,
        });
      }
      return res.json({ success: false, error: 'Conversion failed' });
    }

    // Build config with all styling options
    const config = {
      // Document features
      include_toc: options.include_toc !== false,
      include_lof: options.include_lof !== false,
      include_lot: options.include_lot !== false,
      enable_nlp_backup: options.enable_nlp_backup !== false,
      
      // Font settings
      font_name: options.font_name || "Times New Roman",
      body_font_size_pt: options.body_font_size_pt || 12,
      heading_font_name: options.heading_font_name || null,
      
      // Heading sizes
      heading_1_size_pt: options.heading_1_size_pt || 16,
      heading_2_size_pt: options.heading_2_size_pt || 14,
      heading_3_size_pt: options.heading_3_size_pt || 13,
      
      // Heading colors (hex without #)
      heading_1_color: options.heading_1_color || null,
      heading_2_color: options.heading_2_color || null,
      
      // Spacing
      line_spacing: options.line_spacing || 1.5,
      paragraph_space_after_pt: options.paragraph_space_after_pt || 6,
      
      // Alignment
      body_alignment: options.body_alignment || "justify",
    };

    const configFile = path.join(tempDir, `config_${projectId}_${timestamp}.json`);
    fs.writeFileSync(configFile, JSON.stringify(config));

    // Acknowledge request immediately
    res.json({ success: true, message: "Formatting started" });

    if (io) {
      io.to(userRoom).emit('format_progress', {
        stage: 'processing',
        message: 'Running NLP formatter...',
        progress: 40,
      });
    }

    console.log('Spawning Python process...');
    console.log('Script:', pythonScript);
    console.log('Args:', ['--input', inputFile, '--output', outputFile, '--config', configFile]);

    // Run Python formatter asynchronously with unbuffered output
    const python = spawn("python", [
      "-u",  // Unbuffered output
      pythonScript,
      "--input", inputFile,
      "--output", outputFile,
      "--config", configFile
    ], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stderr = "";
    let processTimedOut = false;

    // Add error handler
    python.on('error', (error) => {
      console.error('Failed to start Python process:', error);
      clearTimeout(timeout);
      
      if (io) {
        io.to(userRoom).emit('format_error', {
          error: 'Failed to start formatter',
          details: `Could not start Python: ${error.message}`,
        });
      }
      
      // Cleanup
      try {
        fs.unlinkSync(inputFile);
        fs.unlinkSync(configFile);
      } catch (e) {}
    });

    // Set a timeout (30 seconds for testing)
    const timeout = setTimeout(() => {
      processTimedOut = true;
      console.log('Python process timeout - killing process');
      python.kill();
      
      if (io) {
        io.to(userRoom).emit('format_error', {
          error: 'Formatting timeout',
          details: 'Process took too long (>30 seconds). The document may be too complex.',
        });
      }
      
      // Cleanup
      try {
        fs.unlinkSync(inputFile);
        fs.unlinkSync(configFile);
      } catch (e) {}
    }, 30000); // 30 seconds for testing

    python.stdout.on("data", (data) => {
      const output = data.toString();
      console.log('Python stdout:', output);
      
      if (io) {
        io.to(userRoom).emit('format_progress', {
          stage: 'processing',
          message: output.trim(),
          progress: 60,
        });
      }
    });

    python.stderr.on("data", (data) => {
      stderr += data.toString();
      const errMsg = data.toString();
      console.error('Python stderr:', errMsg);
      
      // Send stderr to client for debugging
      if (io) {
        io.to(userRoom).emit('format_progress', {
          stage: 'processing',
          message: `Processing... (${errMsg.substring(0, 100)})`,
          progress: 70,
        });
      }
    });

    python.on("close", async (code) => {
      clearTimeout(timeout);
      
      if (processTimedOut) {
        console.log('Process already timed out');
        return;
      }
      
      console.log('Python process closed with code:', code);
      console.log('Checking for output file:', outputFile);
      
      // Check if output file was created (ignore exit code due to Python warnings)
      if (!fs.existsSync(outputFile)) {
        // Formatting failed
        console.error('Python formatter exit code:', code);
        console.error('Python stderr:', stderr);
        
        if (io) {
          io.to(userRoom).emit('format_error', {
            error: 'Output file not created',
            details: stderr || 'Python script completed but no output file was generated',
          });
        }
        // Cleanup
        try {
          fs.unlinkSync(inputFile);
          fs.unlinkSync(configFile);
        } catch (e) {}
        return;
      }

      console.log('Output file created successfully!');
      
      // Success - save formatted document info
      const docId = `formatted_${projectId}_${timestamp}`;
      
      // Store file path in a temporary registry
      global.formattedDocs = global.formattedDocs || {};
      global.formattedDocs[docId] = outputFile;

      // Generate preview HTML by converting DOCX back to HTML
      let previewHtml = '';
      try {
        const docxBuffer = fs.readFileSync(outputFile);
        const result = await mammoth.convertToHtml({ buffer: docxBuffer }, {
          styleMap: [
            "p[style-name='Heading 1'] => h1:fresh",
            "p[style-name='Heading 2'] => h2:fresh",
            "p[style-name='Heading 3'] => h3:fresh",
            "p[style-name='Title'] => h1.title:fresh",
            "p[style-name='Subtitle'] => h2.subtitle:fresh",
          ]
        });
        previewHtml = result.value;
        
        // Add some styling for preview
        previewHtml = `
          <style>
            h1, h2, h3 { 
              color: #2563eb; 
              margin-top: 1.5em; 
              margin-bottom: 0.5em;
              font-family: 'Georgia', serif;
            }
            h1 { font-size: 24px; border-bottom: 2px solid #2563eb; padding-bottom: 0.3em; }
            h2 { font-size: 20px; }
            h3 { font-size: 18px; }
            p { 
              line-height: 1.6; 
              margin-bottom: 1em;
              font-family: 'Times New Roman', serif;
            }
            ul, ol { margin-left: 2em; margin-bottom: 1em; }
            li { margin-bottom: 0.5em; }
            table { 
              border-collapse: collapse; 
              width: 100%; 
              margin-bottom: 1em;
              border: 1px solid #ddd;
            }
            td, th { 
              border: 1px solid #ddd; 
              padding: 8px; 
              text-align: left;
            }
            th { background-color: #f8f9fa; font-weight: bold; }
          </style>
          <div class="alert alert-success mb-3">
            <strong>✅ Formatting Complete!</strong><br>
            Your document has been professionally formatted. Review the preview below and click "Download DOCX" to save.
          </div>
          ${previewHtml}
        `;
      } catch (previewError) {
        console.error('Preview generation error:', previewError);
        // Fallback to static message if preview fails
        previewHtml = `
          <div class="alert alert-success">
            <h3>✅ Formatting Complete!</h3>
            <p>Your document has been professionally formatted with:</p>
            <ul>
              <li>✅ Intelligent heading detection (15 strategies)</li>
              <li>✅ Table of contents with dot leaders</li>
              <li>✅ List of figures and tables</li>
              <li>✅ Proper spacing and alignment</li>
              <li>✅ Professional typography</li>
            </ul>
            <p class="text-muted">Click "Download DOCX" to save the formatted document.</p>
          </div>
        `;
      }

      if (io) {
        io.to(userRoom).emit('format_complete', {
          documentId: docId,
          preview: previewHtml,
          message: 'Formatting complete!',
        });
      }

      // Cleanup input files
      try {
        fs.unlinkSync(inputFile);
        fs.unlinkSync(configFile);
      } catch (e) {}
    });

  } catch (error) {
    console.error("Live formatting error:", error);
    return res.status(500).json({
      error: "Formatting failed",
      details: error.message,
    });
  }
}

/**
 * Download formatted document
 */
async function downloadFormatted(req, res) {
  try {
    const docId = req.params.docId;
    
    global.formattedDocs = global.formattedDocs || {};
    const filePath = global.formattedDocs[docId];

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Formatted document not found" });
    }

    res.download(filePath, "formatted_document.docx", (err) => {
      if (err) {
        console.error("Download error:", err);
      }
      // Cleanup after download
      setTimeout(() => {
        try {
          fs.unlinkSync(filePath);
          delete global.formattedDocs[docId];
        } catch (e) {}
      }, 5000);
    });

  } catch (error) {
    console.error("Download error:", error);
    return res.status(500).json({
      error: "Download failed",
      details: error.message,
    });
  }
}

module.exports = {
  formatLive,
  downloadFormatted,
};
