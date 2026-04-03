<!DOCTYPE html>
<html lang="en">

<head>
	<meta charset="UTF-8">
	<title>Civitai Data Viewer</title>
	<link rel="stylesheet" href="css/style.css">
</head>

<body>

	<!-- Sidebar -->
	<div class="sidebar">
		<h2>Checkpoints Library</h2>
		<div id="checkpointsList">Loading...</div>

		<h2>Loras Library</h2>
		<div id="lorasList">Loading...</div>
	</div>

	<!-- Main Content -->
	<div class="main-content">
		<div class="container">
			<!--<h1>Civitai Data Viewer</h1>-->
		
			<div class="input-group">
				<span class="url-prefix">https://civitai.com/models/</span>
				<input type="text" id="modelId" placeholder="Enter model ID (e.g., 43331)" autofocus>
				<button id="goBtn">Go</button>
			</div>

		<div id="addToDbSection" style="display: none; margin: 20px 0;">
			<button id="addToDbBtn" style="padding: 10px 20px; background: #228be6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: bold;">
				Add to Database
			</button>
			<span id="addToDbStatus" style="margin-left: 10px; font-size: 13px;"></span>
		</div>

		<div id="modelTags" class="version-links">
			<div class="title">Tags:</div>
			<div id="modelTagsContainer" class="version-links-container"></div>
		</div>

		<div id="versionLinks" class="version-links">
			<div class="title">Versions:</div>
			<div id="versionLinksContainer" class="version-links-container"></div>
		</div>

		<div id="output"></div>
	</div>

</div>

<script src="js/script.js"></script>
</body>
</html>
