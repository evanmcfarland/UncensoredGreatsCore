import expressRateLimit from "express-rate-limit";
import { bookSearch, extractLibraryData } from '../../utils/weaviate';
import AUTHOR_INFO from "../../data/author_data";
import Levenshtein from 'levenshtein';

const key = process.env.OPENAI_API_KEY;

const apiLimiter = expressRateLimit({
    windowMs: 60 * 60 * 1000,
    max: 40,
    message: "Too many queries created from this IP, please try again after an hour",
    keyGenerator: (req) => {
        return req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    }
});

function tokenize(string) {
    return string.toLowerCase().split(/\W+/).filter(word => word.length >= 5);
}

function getWeightedLevenshteinScore(queryWord, categoryWord) {
    const levDistance = new Levenshtein(queryWord, categoryWord);
    const score = 1 / (1 + levDistance.distance);
    
    // Dynamic weighting based on word length.
    return score * (1 + (queryWord.length / categoryWord.length));
}

function preprocess(word) {
    return word.trim(); // Just a basic preprocess. This can be enhanced later.
}

function getMostRelatedAuthors(query, authors, num = 3) {
    const scores = {};
    const SOME_THRESHOLD = 0.5; // You can change this value based on testing results.

    const tokenizedQuery = tokenize(query).map(preprocess);

    authors.forEach(author => {
        let score = 0;
        let categoryScores = [];

        author.category.forEach(category => {
            const tokenizedCategory = tokenize(category).map(preprocess);
            let categoryScore = 0;

            tokenizedQuery.forEach(queryWord => {
                tokenizedCategory.forEach(categoryWord => {
                    const currentScore = getWeightedLevenshteinScore(queryWord, categoryWord);
                    categoryScore += currentScore;
                });
            });

            // Filter out or reduce the effect of low-scoring categories.
            if (categoryScore > SOME_THRESHOLD) {
                categoryScores.push(categoryScore);
            }
        });

        if (categoryScores.length) { // To prevent division by zero
            score = categoryScores.reduce((acc, curr) => acc + curr, 0) / categoryScores.length;
        }
        scores[author.cluster] = score;
    });

    const sortedAuthors = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);
    return sortedAuthors.slice(0, num);
}



export default async function handler(req, res) {
    const isRateLimited = await new Promise((resolve) => {
        apiLimiter(req, res, (next) => {
            if (res.headersSent) resolve(true);
            else resolve(false);
        });
    });

    if (isRateLimited) {
        return res.status(429).json({ error: "Too many requests. Please try again later." });
    }    

    try {
        const { query, author: authorId } = req.body; 

        let relatedAuthors;

        if (authorId) {
            const authorCluster = AUTHOR_INFO.find(a => a.id === authorId)?.cluster;
            if (authorCluster) {
                relatedAuthors = [authorCluster];
            } else {
                relatedAuthors = getMostRelatedAuthors(query, AUTHOR_INFO);
            }
        } else {
            relatedAuthors = getMostRelatedAuthors(query, AUTHOR_INFO);
        }

        // Rest of your processing and response code
        let combinedData = {
            authors: [],
            titles: [],
            headings: [],
            contents: [],
            summaries: [],
        };

        for (const authorCluster of relatedAuthors) {
            const authorInfo = AUTHOR_INFO.find(a => a.cluster === authorCluster);

            if (authorInfo) {
                const sources = await bookSearch(query, 1, authorInfo.cluster, key);
                const data = await extractLibraryData(sources);

                combinedData.titles.push(...data.titles);
                combinedData.headings.push(...data.headings);
                combinedData.contents.push(...data.contents);
                combinedData.summaries.push(...data.summaries);

                combinedData.authors.push({
                    id: authorInfo.id,
                    first: authorInfo.first,
                    last: authorInfo.last,
                    image: authorInfo.image,
                    description: authorInfo.description,
                    category: authorInfo.category,
                    cap_first: authorInfo.cap_first,
                    cluster: authorInfo.cluster,
                    books: authorInfo.books,
                    sentences_json: authorInfo.sentences_json,
                    segments_json: authorInfo.segments_json,
                    paragraphs_json: authorInfo.paragraphs_json,
                });
            }
        }

        res.status(200).json(combinedData);

    } catch (error) {
        console.error("Error in semantic-library API endpoint:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}































// // Basic Levenshtein distance

// import expressRateLimit from "express-rate-limit";
// import { bookSearch, extractLibraryData } from '../../utils/weaviate';
// import AUTHOR_INFO from "../../data/author_data";
// import Levenshtein from 'levenshtein';

// const key = process.env.OPENAI_API_KEY;

// const apiLimiter = expressRateLimit({
//     windowMs: 60 * 60 * 1000,
//     max: 40,
//     message: "Too many queries created from this IP, please try again after an hour",
//     keyGenerator: (req) => {
//         return req.headers['x-forwarded-for'] || req.connection.remoteAddress;
//     }
// });

// function getLevenshteinScore(query, category) {
//     const levDistance = new Levenshtein(query.toLowerCase(), category.toLowerCase());
//     return (1 / (1 + levDistance.distance));
// }

// function getMostRelatedAuthors(query, authors, num = 3) {
//     const scores = {};

//     authors.forEach(author => {
//         let score = 0;
//         author.category.forEach(category => {
//             score += getLevenshteinScore(query, category);
//         });
//         scores[author.cluster] = score / author.category.length;
//     });

//     const sortedAuthors = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);
//     return sortedAuthors.slice(0, num);
// }

// export default async function handler(req, res) {
//     const isRateLimited = await new Promise((resolve) => {
//         apiLimiter(req, res, (next) => {
//             if (res.headersSent) resolve(true);
//             else resolve(false);
//         });
//     });

//     if (isRateLimited) {
//         return res.status(429).json({ error: "Too many requests. Please try again later." });
//     }    

//     try {
//         const { query, author: authorId } = req.body; 

//         let relatedAuthors;

//         if (authorId) {
//             const authorCluster = AUTHOR_INFO.find(a => a.id === authorId)?.cluster;
//             if (authorCluster) {
//                 relatedAuthors = [authorCluster];
//             } else {
//                 relatedAuthors = getMostRelatedAuthors(query, AUTHOR_INFO);
//             }
//         } else {
//             relatedAuthors = getMostRelatedAuthors(query, AUTHOR_INFO);
//         }

//         // Rest of your processing and response code
//         let combinedData = {
//             authors: [],
//             titles: [],
//             headings: [],
//             contents: [],
//             summaries: [],
//         };

//         for (const authorCluster of relatedAuthors) {
//             const authorInfo = AUTHOR_INFO.find(a => a.cluster === authorCluster);

//             if (authorInfo) {
//                 const sources = await bookSearch(query, 1, authorInfo.cluster, key);
//                 const data = await extractLibraryData(sources);

//                 combinedData.titles.push(...data.titles);
//                 combinedData.headings.push(...data.headings);
//                 combinedData.contents.push(...data.contents);
//                 combinedData.summaries.push(...data.summaries);

//                 combinedData.authors.push({
//                     id: authorInfo.id,
//                     first: authorInfo.first,
//                     last: authorInfo.last,
//                     image: authorInfo.image,
//                     description: authorInfo.description,
//                     category: authorInfo.category,
//                     cap_first: authorInfo.cap_first,
//                     cluster: authorInfo.cluster,
//                     books: authorInfo.books,
//                     sentences_json: authorInfo.sentences_json,
//                     segments_json: authorInfo.segments_json,
//                     paragraphs_json: authorInfo.paragraphs_json,
//                 });
//             }
//         }

//         res.status(200).json(combinedData);

//     } catch (error) {
//         console.error("Error in semantic-library API endpoint:", error);
//         res.status(500).json({ error: "Internal Server Error" });
//     }
// }

















// // OG with IFIDF

// import expressRateLimit from "express-rate-limit";
// import { TfIdf } from "natural";
// import { bookSearch, extractLibraryData } from '../../utils/weaviate';
// import AUTHOR_INFO from "../../data/author_data";

// const key = process.env.OPENAI_API_KEY;

// const apiLimiter = expressRateLimit({
//     windowMs: 60 * 60 * 1000, // 1 hour in milliseconds
//     max: 40, // limit each IP to 50 requests per windowMs
//     message: "Too many queries created from this IP, please try again after an hour",
//     keyGenerator: (req) => {
//         return req.headers['x-forwarded-for'] || req.connection.remoteAddress;
//     }
// });

// const authorsDescriptions = {};

// for (const author of AUTHOR_INFO) {
//     authorsDescriptions[author.cluster] = author.description;
// }

// let tfidf = new TfIdf();

// for (let author in authorsDescriptions) {
//     tfidf.addDocument(authorsDescriptions[author]);
// }

// function getMostRelatedAuthors(query, tfidf, authorsDescriptions, num = 3) {
//     const similarities = {};

//     tfidf.tfidfs(query, (i, measure) => {
//         const author = Object.keys(authorsDescriptions)[i];
//         similarities[author] = measure;
//     });

//     const sortedAuthors = Object.keys(similarities).sort((a, b) => similarities[b] - similarities[a]);
//     return sortedAuthors.slice(0, num);
// }

// export default async function handler(req, res) {
//     const isRateLimited = await new Promise((resolve) => {
//         apiLimiter(req, res, (next) => {
//             if (res.headersSent) resolve(true);
//             else resolve(false);
//         });
//     });

//     if (isRateLimited) {
//         return res.status(429).json({ error: "Too many requests. Please try again later." });
//     }    

//     try {
//         const { query, author: authorId } = req.body; 

//         let relatedAuthors;

//         if (authorId) {
//             const authorCluster = AUTHOR_INFO.find(a => a.id === authorId)?.cluster;
//             if (authorCluster) {
//                 relatedAuthors = [authorCluster];
//             } else {
//                 relatedAuthors = getMostRelatedAuthors(query, tfidf, authorsDescriptions);
//             }
//         } else {
//             relatedAuthors = getMostRelatedAuthors(query, tfidf, authorsDescriptions);
//         }

//         let combinedData = {
//             authors: [],
//             titles: [],
//             headings: [],
//             contents: [],
//             summaries: [],
//         };

//         for (const authorCluster of relatedAuthors) {
//             const authorInfo = AUTHOR_INFO.find(a => a.cluster === authorCluster);

//             if (authorInfo) {
//                 const sources = await bookSearch(query, 1, authorInfo.cluster, key);
//                 const data = await extractLibraryData(sources);

//                 combinedData.titles.push(...data.titles);
//                 combinedData.headings.push(...data.headings);
//                 combinedData.contents.push(...data.contents);
//                 combinedData.summaries.push(...data.summaries);

//                 // Add the required fields from authorInfo to combinedData
//                 combinedData.authors.push({
//                     id: authorInfo.id,
//                     first: authorInfo.first,
//                     last: authorInfo.last,
//                     image: authorInfo.image,
//                     description: authorInfo.description,
//                     category: authorInfo.category,
//                     cap_first: authorInfo.cap_first,
//                     cluster: authorInfo.cluster,
//                     books: authorInfo.books,
//                     sentences_json: authorInfo.sentences_json,
//                     segments_json: authorInfo.segments_json,
//                     paragraphs_json: authorInfo.paragraphs_json,
//                 });
//             }
//         }

//         res.status(200).json(combinedData);

//     } catch (error) {
//         console.error("Error in semantic-library API endpoint:", error);
//         res.status(500).json({ error: "Internal Server Error" });
//     }
// }





