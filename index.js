const TWEET_MAX_LENGTH = 140;
const TWEET_LINK_LENGTH = 23;

const http = require("http"),
	https = require("https"),
	querystring = require("querystring"),
	Twitter = require("twitter");

const twitter = new Twitter({
	consumer_key: process.env.TWITTER_CONSUMER_KEY,
	consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
	access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
	access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
});

var gith = require("gith").create(6990);

gith().on("file:all", (payload) => {
	var commits = payload.original.commits,
		headCommit = payload.original.head_commit,
		message = "", url = "";

	if (commits.length > 1) {
		message = `Pushed ${commits.length} commits including “${headCommit.message}”`;
		url = payload.urls.compare;
	} else {
		message = headCommit.message;
		url = headCommit.url;
	}

	var private = false;

	if (!payload.original.repository.private) {
		doTweet(payload.original.repository.name, payload.pusher, message, url);
	}

	doSlack(payload.repo, payload.pusher, message, payload.urls.compare, commits);
});

gith().on("tag:add", (payload) => {
	doTweet(payload.repo, payload.pusher, `Released ${payload.tag}:`, `${payload.original.repository.html_url}/releases/tag/${payload.tag}`);
});

function doTweet(repo, pusher, message, url) {
	var tweet = `[${repo}] ${pusher}: ${message}`;

	if (tweet.length > TWEET_MAX_LENGTH - TWEET_LINK_LENGTH - 1) {
		tweet = tweet.substring(0, TWEET_MAX_LENGTH - TWEET_LINK_LENGTH - 2) + "\u2026";
	}

	tweet += " " + encodeURI(url);

	twitter.post("statuses/update", {
		status: tweet
	}).then((tweet) => {
		// yay?
	}).catch((error) => {
		console.warn("[!] tweet error:", error);
	});
}

function doSlack(repo, pusher, message, url, commits) {
	var fields = [];

	commits.forEach(function(commit) {
		var sha = commit.id.substring(0, 7);

		var data = {
			value: `<${commit.url}|${sha}> ${commit.author.username}: ${commit.message}`
		};

		fields.push(data);
	});

	if (fields.length > 20) {
		var length = fields.length - 20;

		fields = fields.splice(0, 20);
		fields.push({
			value: `(and ${length} more)`
		});
	}

	var json = {
		channel: `#${process.env.SLACK_CHANNEL}`,
		username: process.env.SLACK_USERNAME,
		icon_emoji: process.env.SLACK_ICON_EMOJI,

		attachments: [
			{
				fallback: `[${repo}] ${pusher} pushed: ${message} ${url}`,
				pretext: `[${repo}] ${pusher} pushed: (<${url}|compare>)`,
				fields: fields
			}
		]
	};

	var data = querystring.stringify({
		payload: JSON.stringify(json)
	});

	var req = https.request({
		hostname: "hooks.slack.com",
		port: 443,
		path: process.env.SLACK_INTEGRATION_PATH,
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			"Content-Length": data.length
		}
	}, (res) => {
		if (res.statusCode != 200) {
			console.warn("[!] send failed:", res.statusCode, res.headers);
			return;
		}
	});

	req.on("error", (error) => {
		console.warn("[!] send error:", error);
	});

	req.write(data);
	req.end();
}
