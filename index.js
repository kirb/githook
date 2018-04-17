const TWEET_MAX_LENGTH = 280;
const TWEET_LINK_LENGTH = 23;

const request = require("request-promise-native"),
	querystring = require("querystring"),
	URL = require("url").URL,
	Twitter = require("twitter");

let twitter = new Twitter({
	consumer_key: process.env.TWITTER_CONSUMER_KEY,
	consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
	access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
	access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
});

let gith = require("gith").create(6990);

gith().on("file:all", (payload) => {
	let commits = payload.original.commits,
		headCommit = payload.original.head_commit,
		message = "", url = "";

	if (commits.length > 1) {
		message = `Pushed ${commits.length} commits including “${headCommit.message}”`;
		url = payload.urls.compare;
	} else {
		message = headCommit.message;
		url = headCommit.url;
	}

	if (!payload.original.repository.private) {
		doTweet(payload.original.repository.name, payload.pusher, message, url);
	}

	doSlack(payload.repo, payload.pusher, message, payload.urls.compare, commits);
});

gith().on("tag:add", (payload) => {
	doTweet(payload.repo, payload.pusher, `Released ${payload.tag}:`, `${payload.original.repository.html_url}/releases/tag/${payload.tag}`);
});

async function doTweet(repo, pusher, message, url) {
	let tweet = `[${repo}] ${pusher}: ${message}`;

	if (tweet.length > TWEET_MAX_LENGTH - TWEET_LINK_LENGTH - 1) {
		tweet = tweet.substring(0, TWEET_MAX_LENGTH - TWEET_LINK_LENGTH - 2) + "\u2026";
	}

	tweet += " " + encodeURI(url);

	try {
		await twitter.post("statuses/update", {
			status: tweet
		});
	} catch (error) {
		console.warn("[!] tweet error:", error);
	}
}

async function doSlack(repo, pusher, message, url, commits) {
	let fields = [];

	commits.forEach(function(commit) {
		let sha = commit.id.substring(0, 7);

		let data = {
			value: `<${commit.url}|${sha}> ${commit.author.username}: ${commit.message}`
		};

		fields.push(data);
	});

	if (fields.length > 20) {
		let length = fields.length - 20;

		fields = fields.splice(0, 20);
		fields.push({
			value: `(and ${length} more)`
		});
	}

	let json = {
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

	try {
		let url = new URL("https://hooks.slack.com/");
		url.path = process.env.SLACK_INTEGRATION_PATH;

		let res = await request.post(url.toString(), {
			form: {
				payload: JSON.stringify(json)
			}
		});
	} catch (error) {
		console.warn("[!] send error:", error);
	}
}
